from datetime import UTC, datetime
from uuid import uuid4

from llm_radar.database.models import ModelProfile, Source
from llm_radar.source_resolution import should_replace_profile


def source(reliability: str) -> Source:
    return Source(
        id=uuid4(),
        name=reliability,
        slug=reliability,
        url="https://example.com",
        source_type="api",
        reliability_level=reliability,
    )


def test_official_source_is_not_replaced_by_fresh_third_party_data() -> None:
    official = source("official_api")
    third_party = source("third_party")
    profile = ModelProfile(model_id=uuid4(), source_id=official.id, observed_at=datetime.now(UTC))
    assert should_replace_profile(profile, official, third_party) is False
    assert should_replace_profile(profile, third_party, official) is True
