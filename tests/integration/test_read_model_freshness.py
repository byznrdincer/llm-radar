"""Processor handlers refresh a touched model's read-model fields inline,
in the same transaction, instead of waiting for the periodic sweep.

Rolled back after each test. Set LLM_RADAR_INTEGRATION_DATABASE_URL to run.
"""

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from llm_radar.database.models import Model, ModelProfile, ModelSnapshot, Source
from llm_radar.events.schemas import EventEnvelope, EventMetadata, EventType, ReliabilityLevel
from llm_radar.processor.common import _upsert_source
from llm_radar.processor.handlers import _handle_model

DATABASE_URL = os.getenv("LLM_RADAR_INTEGRATION_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="LLM_RADAR_INTEGRATION_DATABASE_URL was not provided"
)


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine(DATABASE_URL)  # type: ignore[arg-type]
    db = Session(engine)
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def test_handle_model_refreshes_effective_openness_inline(session: Session) -> None:
    row = session.execute(
        select(Model, ModelSnapshot, Source)
        .join(ModelSnapshot, ModelSnapshot.model_id == Model.id)
        .join(Source, Source.id == ModelSnapshot.source_id)
        .order_by(ModelSnapshot.observed_at.desc())
        .limit(1)
    ).first()
    assert row is not None
    model, snapshot, source_row = row

    # Mutate the payload so the processor sees a real content change and takes
    # the upsert_model_profile path, while pinning a license/availability the
    # openness resolver will actually pick up.
    payload = dict(snapshot.data or {})
    payload["name"] = model.name
    payload["license"] = "Apache-2.0"
    payload["is_open_weight"] = True
    payload["_freshness_probe"] = str(uuid4())

    event = EventEnvelope(
        event_type=EventType.MODEL_UPDATED,
        source=source_row.name,
        entity_key=model.slug,
        occurred_at=datetime.now(UTC),
        payload=payload,
        metadata=EventMetadata(
            source_url="https://example.com/probe",
            reliability=ReliabilityLevel.OFFICIAL_API,
        ),
    )
    source = _upsert_source(session, event)

    _handle_model(session, event, source)
    session.flush()

    profile = session.get(ModelProfile, model.id)
    assert profile is not None
    assert profile.effective_openness in {"open_source", "open_weight"}
