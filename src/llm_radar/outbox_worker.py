import json
import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from confluent_kafka import Producer
from sqlalchemy import select

from llm_radar.config import get_settings
from llm_radar.database.models import OutboxEvent
from llm_radar.database.session import SessionLocal

logger = logging.getLogger(__name__)

_FLUSH_TIMEOUT_SECONDS = 30.0
_MAX_ATTEMPTS = 10


@dataclass(frozen=True, slots=True)
class _OutboxItem:
    id: UUID
    topic: str
    event_key: str
    payload: dict[str, Any]


def _deliver(producer: Producer, items: Sequence[_OutboxItem]) -> dict[UUID, str | None]:
    """Produce every item to the local queue with a per-item delivery
    callback, then flush once. Pure Kafka I/O - no DB session touched here -
    so the caller never has to hold a transaction (and its row locks) open
    across this call, which can block on network I/O for seconds.

    Returns item id -> None on success, else the delivery error string.
    """
    if not items:
        return {}
    results: dict[UUID, str | None] = {}

    def _on_delivery(item_id: UUID) -> Callable[[object, object], None]:
        def _callback(err: object, _msg: object) -> None:
            results[item_id] = None if err is None else str(err)[:1000]

        return _callback

    for item in items:
        while True:
            try:
                producer.produce(
                    item.topic,
                    key=item.event_key.encode(),
                    value=json.dumps(item.payload, default=str).encode(),
                    on_delivery=_on_delivery(item.id),
                )
                break
            except BufferError:
                # Local queue full - let it drain, then retry this item.
                producer.poll(1)

    producer.flush(_FLUSH_TIMEOUT_SECONDS)
    return results


def _apply_delivery_results(rows: Sequence[OutboxEvent], results: dict[UUID, str | None]) -> int:
    """Write each row's status from its _deliver() result. Pure bookkeeping -
    no Kafka I/O - so the transaction around this stays short."""
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
        rows = session.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.status.in_(["pending", "retry"]))
            .order_by(OutboxEvent.created_at)
            .with_for_update(skip_locked=True)
            .limit(batch_size)
        ).all()
        if not rows:
            return 0
        items = [_OutboxItem(row.id, row.topic, row.event_key, row.payload) for row in rows]
        # Commit immediately - releasing the SELECT ... FOR UPDATE lock -
        # instead of holding it open across the Kafka flush below. A
        # concurrently-scaled worker re-claiming these still-pending/retry
        # rows only risks a harmless duplicate publish under the outbox's
        # already-accepted at-least-once design (domain-topic consumers key
        # off event_id); it should never be blocked on this transaction.
        session.commit()

    results = _deliver(producer, items)

    with SessionLocal() as session:
        # Re-fetch every *claimed* row, not just the ones results has an
        # entry for: if flush() hits its timeout with messages still
        # in-flight, their delivery callback never fires and they're simply
        # absent from results. _apply_delivery_results already treats a
        # missing id as "no delivery report" (retry/fail it); querying by
        # results.keys() here would skip those rows entirely, leaving their
        # status and attempts untouched - they'd get silently re-claimed and
        # retried forever on the same terms, bypassing _MAX_ATTEMPTS instead
        # of eventually being marked failed.
        claimed_ids = [item.id for item in items]
        rows = session.scalars(select(OutboxEvent).where(OutboxEvent.id.in_(claimed_ids))).all()
        published = _apply_delivery_results(rows, results)
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
