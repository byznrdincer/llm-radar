from datetime import timedelta

from llm_radar.database.models import ModelProfile, Source

RELIABILITY_SCORES = {
    "official_api": 100,
    "official_document": 95,
    "independent_measurement": 90,
    "academic": 85,
    "third_party": 70,
    "community": 45,
    "unverified": 20,
}


def source_score(source: Source) -> int:
    return RELIABILITY_SCORES.get(source.reliability_level, 20)


def should_replace_profile(
    profile: ModelProfile, current_source: Source | None, incoming_source: Source
) -> bool:
    """Prefer authority; allow lower-authority data only when canonical data is stale."""
    if current_source is None or profile.source_id == incoming_source.id:
        return True
    if source_score(incoming_source) >= source_score(current_source):
        return True
    return incoming_source.last_success_at is not None and (
        incoming_source.last_success_at > profile.observed_at + timedelta(days=30)
    )
