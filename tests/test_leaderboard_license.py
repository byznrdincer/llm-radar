from llm_radar.api.routes import _known_family_license, _resolve_leaderboard_license


def test_known_closed_model_families_are_not_left_unknown() -> None:
    assert _known_family_license("Claude Opus 4.5 (high)", "Anthropic") == "Proprietary"
    assert _known_family_license("GPT-5.2 (high)", "OpenAI") == "Proprietary"
    assert _known_family_license("Gemini 3 Flash (high)", "Google") == "Proprietary"


def test_known_open_weight_families_are_not_left_unknown() -> None:
    assert _known_family_license("OpenAI GPT-OSS 120B", "OpenAI") == "Open"
    assert _known_family_license("Qwen3.5-397B-A17B", "Alibaba Cloud") == "Open"
    assert _known_family_license("DeepSeek V4", "DeepSeek") == "Open"
    assert _known_family_license("GLM-5 (enabled)", "Zhipu AI") == "MIT"
    assert _known_family_license("Nemotron-Orchestrator-8B", "NVIDIA") == "Open"


def test_service_only_model_tiers_are_classified_as_closed() -> None:
    assert _known_family_license("Qwen3-Max-Thinking", "Qwen") == "Proprietary"
    assert _known_family_license("Grok-4.3", "SpaceXAI") == "Proprietary"


def test_explicit_benchmark_license_has_priority() -> None:
    license_name, method = _resolve_leaderboard_license(
        raw_license="Proprietary",
        model_name="Example Model",
        organization="Example",
        catalog_index={},
    )
    assert license_name == "Proprietary"
    assert method == "benchmark"


def test_unverified_family_remains_unknown() -> None:
    license_name, method = _resolve_leaderboard_license(
        raw_license="Unknown",
        model_name="Unannounced Model X",
        organization="Unknown Lab",
        catalog_index={},
    )
    assert license_name == "Unknown"
    assert method == "unresolved"
