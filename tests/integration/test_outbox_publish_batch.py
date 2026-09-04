"""publish_batch against a real Postgres schema.

publish_batch commits internally (two short transactions instead of one long
one - see outbox_worker.py), so this can't use the rolled-back-session
pattern the other integration tests use; it inserts one throwaway row and
deletes it explicitly afterward. It also only runs when the outbox has no
other pending/retry rows: publish_batch has no way to scope itself to just
the test's own row, and a fake producer that "delivers" real pending events
without actually sending them to Kafka would falsely mark real data as
published. Set LLM_RADAR_INTEGRATION_DATABASE_URL to run.
"""

import os
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session

from llm_radar.database.models import OutboxEvent

# publish_batch goes through llm_radar.database.session.SessionLocal rather
# than a session this test controls; conftest.py points its DATABASE_URL at
# LLM_RADAR_INTEGRATION_DATABASE_URL before collection.
DATABASE_URL = os.getenv("LLM_RADAR_INTEGRATION_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="LLM_RADAR_INTEGRATION_DATABASE_URL was not provided"
)


class _FakeProducer:
    def __init__(self) -> None:
        self.produced: list[tuple[str, bytes]] = []
        self._pending: list[Any] = []

    def produce(self, topic: str, *, key: bytes, value: bytes, on_delivery: Any) -> None:
        self.produced.append((topic, value))
        self._pending.append(on_delivery)

    def flush(self, _timeout: float) -> int:
        for callback in self._pending:
            callback(None, None)
        self._pending.clear()
        return 0

    def poll(self, _timeout: float) -> int:  # pragma: no cover
        return 0


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine(DATABASE_URL)  # type: ignore[arg-type]
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()


def _other_pending_rows(session: Session) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(OutboxEvent)
            .where(OutboxEvent.status.in_(["pending", "retry"]))
        )
        or 0
    )


def test_publish_batch_marks_a_real_row_published(session: Session) -> None:
    if _other_pending_rows(session) > 0:
        pytest.skip("outbox has other pending/retry rows; publish_batch would touch them too")

    from llm_radar.outbox_worker import publish_batch

    row_id = uuid4()
    session.add(
        OutboxEvent(
            id=row_id, topic="llm.zztest_probe", event_key="zztest",
            payload={"probe": True}, status="pending",
        )
    )
    session.commit()
    try:
        published = publish_batch(_FakeProducer(), batch_size=500)  # type: ignore[arg-type]
        assert published == 1

        row = session.get(OutboxEvent, row_id)
        assert row is not None
        assert row.status == "published"
        assert row.published_at is not None
    finally:
        session.execute(delete(OutboxEvent).where(OutboxEvent.id == row_id))
        session.commit()


def test_publish_batch_with_zero_batch_size_returns_zero(session: Session) -> None:
    from llm_radar.outbox_worker import publish_batch

    published = publish_batch(_FakeProducer(), batch_size=0)  # type: ignore[arg-type]
    assert published == 0
