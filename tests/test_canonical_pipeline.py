from llm_radar.canonical_pipeline import merge_runtime_capabilities, observation_fingerprints
from llm_radar.model_features import normalize_model_features


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
