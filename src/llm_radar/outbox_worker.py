import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from confluent_kafka import Producer
from sqlalchemy import select

from llm_radar.config import get_settings
from llm_radar.database.models import OutboxEvent
from llm_radar.database.session import SessionLocal

logger = logging.getLogger(__name__)

_FLUSH_TIMEOUT_SECONDS = 30.0
_MAX_ATTEMPTS = 10


def drain_rows(producer: Producer, rows: list[OutboxEvent]) -> int:
    """Produce every row to the local queue with a per-row delivery callback,
    flush once, then write each row's status from its delivery report.

    The previous implementation flushed after every row, turning each publish
    into a synchronous Kafka round-trip.
    """
    if not rows:
        return 0

    # row id -> None on success, else the delivery error string.
    results: dict[UUID, str | None] = {}

    def _on_delivery(row_id: UUID) -> Callable[[object, object], None]:
        def _callback(err: object, _msg: object) -> None:
            results[row_id] = None if err is None else str(err)[:1000]

        return _callback

    for row in rows:
        while True:
            try:
                producer.produce(
                    row.topic,
                    key=row.event_key.encode(),
                    value=json.dumps(row.payload, default=str).encode(),
                    on_delivery=_on_delivery(row.id),
                )
                break
            except BufferError:
                # Local queue full - let it drain, then retry this row.
                producer.poll(1)

    producer.flush(_FLUSH_TIMEOUT_SECONDS)

    published = 0
    now = datetime.now(UTC)
    for row in rows:
        error = results.get(row.id, "no delivery report")
        if error is None:
            row.status = "published"
            row.published_at = now
            row.last_error = None
            published += 1
        else:
            row.attempts += 1
            row.status = "failed" if row.attempts >= _MAX_ATTEMPTS else "retry"
            row.last_error = error
            logger.warning("outbox publish failed for %s: %s", row.id, error)
    return published


def publish_batch(producer: Producer, batch_size: int = 100) -> int:
    with SessionLocal() as session:
        rows = list(
            session.scalars(
                select(OutboxEvent)
                .where(OutboxEvent.status.in_(["pending", "retry"]))
                .order_by(OutboxEvent.created_at)
                .with_for_update(skip_locked=True)
                .limit(batch_size)
            )
        )
        published = drain_rows(producer, rows)
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
