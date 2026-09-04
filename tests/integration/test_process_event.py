"""process_event replayed over real outbox payloads, rolled back after each test.

A regression net for the processor dispatch + handlers + shared helpers. Set
LLM_RADAR_INTEGRATION_DATABASE_URL to run.
"""

import os
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from llm_radar.database.models import ChangeEvent, OutboxEvent
from llm_radar.events.schemas import EventEnvelope
from llm_radar.events.topics import PROCESSED_EVENTS
from llm_radar.processor.service import process_event

DATABASE_URL = os.getenv("LLM_RADAR_INTEGRATION_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="LLM_RADAR_INTEGRATION_DATABASE_URL was not provided"
)

_EVENT_TYPES = [
    "leaderboard.changed",
    "research.published",
    "model.updated",
    "company.announcement",
    "github.release_published",
    "technology.detected",
    "regulation.updated",
    "security.advisory",
]


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine(DATABASE_URL)  # type: ignore[arg-type]
    db = Session(engine)
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def _sample_envelopes(db: Session, event_type: str, limit: int) -> list[EventEnvelope]:
    rows = db.scalars(
        select(OutboxEvent)
        .where(
            OutboxEvent.topic == PROCESSED_EVENTS,
            OutboxEvent.payload["event_type"].astext == event_type,
        )
        .order_by(OutboxEvent.created_at.desc())
        .limit(limit)
    ).all()
    envelopes = []
    for row in rows:
        payload = row.payload or {}
        if {"source", "entity_key", "metadata"}.issubset(payload):
            try:
                envelopes.append(EventEnvelope.model_validate(payload))
            except ValueError:
                continue
    return envelopes


@pytest.mark.parametrize("event_type", _EVENT_TYPES)
def test_process_event_replays_without_error(session: Session, event_type: str) -> None:
    envelopes = _sample_envelopes(session, event_type, 5)
    if not envelopes:
        pytest.skip(f"no {event_type} payloads in the outbox")

    for envelope in envelopes:
        # process_event commits internally; the fixture rolls back after.
        changes = process_event(session, envelope)
        assert isinstance(changes, list)
        for change in changes:
            assert isinstance(change, ChangeEvent)
            assert change.entity_type
            assert change.event_type
            assert 0 <= change.importance_score <= 100
        session.rollback()
