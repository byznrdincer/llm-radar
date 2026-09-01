from typing import Any, cast

from sqlalchemy.orm import Session

from llm_radar.database.models import Model, ModelProfile
from llm_radar.model_selection import multimodal_profile_matches


class FakeResult:
    def __init__(self, rows: list[tuple[Model, ModelProfile]]) -> None:
        self.rows = rows

    def all(self) -> list[tuple[Model, ModelProfile]]:
        return self.rows


class FakeSession:
    def __init__(self, rows: list[tuple[Model, ModelProfile]]) -> None:
        self.rows = rows

    def execute(self, _query: Any) -> FakeResult:
        return FakeResult(self.rows)


def test_multimodal_selection_uses_asserted_profile_modalities() -> None:
    model = Model(name="Omni", slug="vendor/omni", capabilities={})
    profile = ModelProfile(
        model_id=model.id,
        source_id=model.id,
        modalities=["text", "image", "audio", "video"],
    )
    text_only = Model(name="Text Only", slug="vendor/text", capabilities={})
    text_profile = ModelProfile(
        model_id=text_only.id,
        source_id=text_only.id,
        modalities=["text"],
    )

    matches = multimodal_profile_matches(
        cast(Session, FakeSession([(model, profile), (text_only, text_profile)]))
    )

    assert set(matches) == {"omni"}
    assert matches["omni"].score == 100
    assert matches["omni"].basis == "profile"
