from datetime import date

from llm_radar.backfill_merge_duplicate_models import _distinct_checkpoints
from llm_radar.canonical_pipeline import merge_runtime_capabilities, observation_fingerprints
from llm_radar.database.models import Model
from llm_radar.model_features import normalize_model_features


def _model(**kw: object) -> Model:
    return Model(name="m", slug="s", company_id=None, **kw)  # type: ignore[arg-type]


def test_distinct_checkpoints_flags_conflicting_release_dates() -> None:
    models = [_model(release_date=date(2024, 1, 1)), _model(release_date=date(2024, 6, 1))]
    assert _distinct_checkpoints(models) is True


def test_distinct_checkpoints_flags_conflicting_families() -> None:
    assert _distinct_checkpoints([_model(family="llama-3"), _model(family="llama-4")]) is True


def test_distinct_checkpoints_allows_same_or_missing_facts() -> None:
    models = [_model(release_date=date(2024, 1, 1)), _model(family="llama-3")]
    assert _distinct_checkpoints(models) is False


def test_merge_runtime_capabilities_adds_local_flags() -> None:
    merged = merge_runtime_capabilities(["vision"], {"ollama_compatible": True})
    assert "ollama_compatible" in merged
    assert "local_runnable" not in merged


def test_observation_fingerprints_include_runtime_source() -> None:
    from uuid import uuid4

    fingerprints = observation_fingerprints(
        uuid4(),
        {"external_id": "llama3.2", "runtime_platform": "ollama"},
    )
    assert "content_hash" in fingerprints
    assert fingerprints["ollama_id"] == "llama3.2"


def test_normalize_model_features_includes_runtime_capabilities() -> None:
    normalized = normalize_model_features(
        {
            "local_runnable": True,
            "ollama_compatible": True,
            "capabilities": ["vision"],
        }
    )
    assert "local_runnable" in normalized.capabilities
    assert "ollama_compatible" in normalized.capabilities
