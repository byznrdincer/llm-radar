import json
import logging
import time
from datetime import UTC, datetime

from confluent_kafka import Producer
from sqlalchemy import select

from llm_radar.config import get_settings
from llm_radar.database.models import OutboxEvent
from llm_radar.database.session import SessionLocal

logger = logging.getLogger(__name__)


def publish_batch(producer: Producer, batch_size: int = 100) -> int:
    with SessionLocal() as session:
        rows = session.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.status.in_(["pending", "retry"]))
            .order_by(OutboxEvent.created_at)
            .with_for_update(skip_locked=True)
            .limit(batch_size)
        ).all()
        published = 0
        for row in rows:
            try:
                producer.produce(
                    row.topic,
                    key=row.event_key.encode(),
                    value=json.dumps(row.payload, default=str).encode(),
                )
                producer.flush(10)
                row.status = "published"
                row.published_at = datetime.now(UTC)
                row.last_error = None
                published += 1
            except Exception as exc:
                row.attempts += 1
                row.status = "failed" if row.attempts >= 10 else "retry"
                row.last_error = str(exc)[:1000]
                logger.exception("outbox publish failed for %s", row.id)
        session.commit()
        return published


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    producer = Producer(
        {
            "bootstrap.servers": get_settings().kafka_bootstrap_servers,
            "client.id": "llm-radar-outbox",
            "enable.idempotence": True,
            "acks": "all",
        }
    )
    while True:
        if publish_batch(producer) == 0:
            time.sleep(1)


if __name__ == "__main__":
    main()
