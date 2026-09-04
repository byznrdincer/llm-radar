from typing import Any, cast

from sqlalchemy.orm import Session

from llm_radar.database.models import Model, ModelProfile
from llm_radar.model_selection import (
    advancedness_tier_for_score,
    matches_advancedness_filter,
    multimodal_profile_matches,
)


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


def test_advancedness_tier_mapping_and_filter() -> None:
    assert advancedness_tier_for_score(25) == "entry"
    assert advancedness_tier_for_score(55) == "mid"
    assert advancedness_tier_for_score(78) == "advanced"
    assert advancedness_tier_for_score(92) == "frontier"
    assert advancedness_tier_for_score(None) is None

    assert matches_advancedness_filter(92, {"frontier"})
    assert not matches_advancedness_filter(55, {"frontier"})
    assert matches_advancedness_filter(None, {"unscored"})
    assert not matches_advancedness_filter(None, {"frontier"})
