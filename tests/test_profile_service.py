from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

from sqlalchemy.orm import Session

from llm_radar.database.models import Model, ModelProfile
from llm_radar.profile_service import upsert_model_profile


class FakeSession:
    def __init__(self) -> None:
        self.profile: ModelProfile | None = None

    def get(self, model_type: type[Any], _identifier: Any) -> Any:
        return self.profile if model_type is ModelProfile else None

    def add(self, value: Any) -> None:
        if isinstance(value, ModelProfile):
            self.profile = value


def test_upsert_model_profile_is_idempotent() -> None:
    fake_session = FakeSession()
    session = cast(Session, fake_session)
    model = Model(
        id=uuid4(),
        company_id=uuid4(),
        name="Example Model",
        slug="example/model",
        capabilities={},
    )
    source_id = uuid4()
    observed_at = datetime.now(UTC)

    first, _, _ = upsert_model_profile(
        session,
        model=model,
        source_id=source_id,
        observed_at=observed_at,
        payload={"context_window": 128000, "is_open_weight": True},
    )
    second, _, _ = upsert_model_profile(
        session,
        model=model,
        source_id=source_id,
        observed_at=observed_at,
        payload={"context_window": 256000, "is_open_weight": True},
    )

    assert first is second
    assert second.context_window == 256000
    assert model.context_window == 256000
    assert model.is_open_weight is True


def test_older_snapshot_cannot_overwrite_newer_fields() -> None:
    fake_session = FakeSession()
    session = cast(Session, fake_session)
    model = Model(
        id=uuid4(),
        company_id=uuid4(),
        name="Example Model",
        slug="example/model",
        capabilities={},
    )
    source_id = uuid4()
    now = datetime.now(UTC)

    upsert_model_profile(
        session,
        model=model,
        source_id=source_id,
        observed_at=now,
        payload={"context_window": 256000, "input_modalities": ["text", "image"]},
    )
    profile, _, _ = upsert_model_profile(
        session,
        model=model,
        source_id=source_id,
        observed_at=now - timedelta(days=1),
        payload={"context_window": 128000, "input_modalities": ["text"]},
    )

    assert profile.context_window == 256000
    assert profile.modalities == ["text", "image"]


def test_newer_snapshot_replaces_stale_list_values() -> None:
    fake_session = FakeSession()
    session = cast(Session, fake_session)
    model = Model(
        id=uuid4(),
        company_id=uuid4(),
        name="Example Model",
        slug="example/model",
        capabilities={},
    )
    source_id = uuid4()
    now = datetime.now(UTC)

    upsert_model_profile(
        session,
        model=model,
        source_id=source_id,
        observed_at=now,
        payload={"input_modalities": ["text", "image"]},
    )
    profile, _, _ = upsert_model_profile(
        session,
        model=model,
        source_id=source_id,
        observed_at=now + timedelta(minutes=1),
        payload={"input_modalities": ["text"]},
    )

    assert profile.modalities == ["text"]
