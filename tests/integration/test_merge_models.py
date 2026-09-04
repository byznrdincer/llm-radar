"""merge_models against a real Postgres schema, rolled back after each test.

Set LLM_RADAR_INTEGRATION_DATABASE_URL to run (e.g. the local docker Postgres).
"""

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from llm_radar.canonical_pipeline import merge_models
from llm_radar.database.models import (
    ChangeEvent,
    Company,
    EntityAlias,
    FieldObservation,
    Model,
    ModelProfile,
    ModelSnapshot,
    ModelVersion,
    PriceObservation,
    Source,
)

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


def _row_count(db: Session, model_cls: type, **filters: object) -> int:
    query = select(func.count()).select_from(model_cls)
    for name, value in filters.items():
        query = query.where(getattr(model_cls, name) == value)
    return db.scalar(query) or 0


def test_merge_models_repoints_children_and_deletes_source(session: Session) -> None:
    company_id = session.scalar(select(Company.id).limit(1))
    source_id = session.scalar(select(Source.id).limit(1))
    now = datetime.now(UTC)
    dup_id, keep_id = uuid4(), uuid4()

    keep = Model(
        id=keep_id, company_id=company_id, name="ZZ Merge Model",
        slug="ztest/keep", status="active", capabilities={},
    )
    dup = Model(
        id=dup_id, company_id=company_id, name="ZZ Merge Model",
        slug="provider/zz-merge-model", status="active", capabilities={},
        license="Apache-2.0", context_window=128_000,
    )
    session.add_all([keep, dup])
    session.flush()
    session.add_all([
        ModelSnapshot(id=uuid4(), model_id=dup_id, source_id=source_id, data={},
                      content_hash="h", observed_at=now),
        PriceObservation(id=uuid4(), model_id=dup_id, source_id=source_id, provider="p",
                         input_price=Decimal("1"), observed_at=now),
        ModelVersion(id=uuid4(), model_id=dup_id, version="1.0"),
        ModelVersion(id=uuid4(), model_id=keep_id, version="1.0"),
        ModelVersion(id=uuid4(), model_id=dup_id, version="2.0"),
        ModelProfile(model_id=dup_id, source_id=source_id, observed_at=now,
                     modalities=[], capabilities=[], field_provenance={}),
        ChangeEvent(id=uuid4(), entity_type="model", entity_id=dup_id, event_type="x",
                    title="t", category="c", importance="low", importance_score=1,
                    detected_at=now, source_id=source_id),
        FieldObservation(id=uuid4(), entity_type="model", entity_id=dup_id, field_name="f",
                         value={}, valid_from=now, collected_at=now, source_id=source_id,
                         reliability="medium"),
        EntityAlias(id=uuid4(), canonical_key="provider/zz-merge-model",
                    alias_key="ztest-old-alias", method="x"),
    ])
    session.flush()

    merge_models(session, source=dup, target=keep)
    session.flush()

    assert _row_count(session, Model, id=dup_id) == 0
    assert _row_count(session, Model, id=keep_id) == 1
    assert _row_count(session, ModelSnapshot, model_id=keep_id) == 1
    assert _row_count(session, ModelSnapshot, model_id=dup_id) == 0
    assert _row_count(session, PriceObservation, model_id=keep_id) == 1
    # unique (model_id, version) keeps 1.0 + 2.0, the colliding 1.0 is dropped
    assert _row_count(session, ModelVersion, model_id=keep_id) == 2
    # keep already had a profile, so the duplicate's is discarded
    assert _row_count(session, ModelProfile, model_id=keep_id) == 1
    assert _row_count(session, ModelProfile, model_id=dup_id) == 0
    assert _row_count(session, ChangeEvent, entity_id=keep_id) == 1
    assert _row_count(session, FieldObservation, entity_id=keep_id) == 1

    merged = session.get(Model, keep_id)
    assert merged is not None
    assert merged.license == "Apache-2.0"
    assert merged.context_window == 128_000

    aliases = {
        row.alias_key: row.canonical_key
        for row in session.scalars(
            select(EntityAlias).where(
                EntityAlias.alias_key.in_(["ztest-old-alias", "provider/zz-merge-model"])
            )
        )
    }
    assert aliases["ztest-old-alias"] == "ztest/keep"
    assert aliases["provider/zz-merge-model"] == "ztest/keep"


def test_merge_models_moves_profile_when_target_has_none(session: Session) -> None:
    company_id = session.scalar(select(Company.id).limit(1))
    source_id = session.scalar(select(Source.id).limit(1))
    now = datetime.now(UTC)
    dup_id, keep_id = uuid4(), uuid4()

    session.add_all([
        Model(id=keep_id, company_id=company_id, name="ZZ Profileless",
              slug="ztest/keep2", status="active", capabilities={}),
        Model(id=dup_id, company_id=company_id, name="ZZ Profileless",
              slug="provider/zz-profileless", status="active", capabilities={}),
    ])
    session.flush()
    session.add(
        ModelProfile(model_id=dup_id, source_id=source_id, observed_at=now,
                     openness="open_weight", modalities=[], capabilities=[],
                     field_provenance={})
    )
    session.flush()

    dup = session.get(Model, dup_id)
    keep = session.get(Model, keep_id)
    assert dup is not None and keep is not None
    merge_models(session, source=dup, target=keep)
    session.flush()

    assert _row_count(session, ModelProfile, model_id=keep_id) == 1
    assert _row_count(session, ModelProfile, model_id=dup_id) == 0
    profile = session.get(ModelProfile, keep_id)
    assert profile is not None
    assert profile.openness == "open_weight"
