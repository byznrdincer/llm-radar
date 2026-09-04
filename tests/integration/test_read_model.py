"""refresh_read_model against a real Postgres schema, rolled back after each test.

Set LLM_RADAR_INTEGRATION_DATABASE_URL to run.
"""

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from llm_radar.database.models import Company, Model, ModelProfile
from llm_radar.read_model import refresh_read_model

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


def test_refresh_writes_effective_openness_from_the_resolver(session: Session) -> None:
    company_id = session.scalar(select(Company.id).limit(1))
    source_id = session.scalar(select(ModelProfile.source_id).limit(1))
    model_id = uuid4()
    session.add(
        Model(
            id=model_id, company_id=company_id, name="ZZ Read Model Probe",
            slug="ztest/read-model-probe", status="active", capabilities={},
            license="Apache-2.0", is_open_weight=True,
        )
    )
    session.flush()
    session.add(
        ModelProfile(
            model_id=model_id, source_id=source_id, observed_at=datetime.now(UTC),
            modalities=[], capabilities=[], field_provenance={},
        )
    )
    session.flush()

    result = refresh_read_model(session)

    assert result.updated >= 1
    profile = session.get(ModelProfile, model_id)
    assert profile is not None
    # is_open_weight True with an Apache license resolves to an open tier.
    assert profile.effective_openness in {"open_source", "open_weight"}


def test_refresh_is_idempotent(session: Session) -> None:
    refresh_read_model(session)
    session.flush()
    second = refresh_read_model(session)
    assert second.updated == 0


def test_refresh_sets_score_for_a_leaderboard_model(session: Session) -> None:
    # A model whose canonical name matches a leaderboard entry should get a score.
    refresh_read_model(session)
    scored = session.scalar(
        select(ModelProfile.model_id).where(ModelProfile.general_score.is_not(None)).limit(1)
    )
    assert scored is not None
    profile = session.get(ModelProfile, scored)
    assert profile is not None
    assert Decimal(0) <= profile.general_score <= Decimal(100)
