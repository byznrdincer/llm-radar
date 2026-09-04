from llm_radar.api.routes import _resolve_leaderboard_license
from llm_radar.openness import _known_family_license


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


def test_recent_verified_open_weight_models_are_classified() -> None:
    assert _known_family_license("XBai-o4-medium", "OpenAI") == "Apache-2.0"
    assert _known_family_license("Nex-N2-Pro", "Nex AGI") == "Apache-2.0"
    assert _known_family_license("MiMo-V2.5-Pro", "Xiaomi") == "MIT"
    assert _known_family_license("MiMo-V2-Flash (Non-reasoning)", "Xiaomi") == "MIT"
    assert _known_family_license("G9v3-39A5B", "AI9Stars") == "Apache-2.0"
    assert _known_family_license("Inkling (xhigh)", "Thinking Machines") == "Apache-2.0"
    assert _known_family_license("Inkling", "Thinking Machines") == "Apache-2.0"
    assert _known_family_license("GLM-5.2 (xhigh)", "Z.ai") == "MIT"
    assert _known_family_license("Athene-V2-Chat (0-shot)", "Nexusflow") == "Open"


def test_legacy_mmlu_open_weight_models_are_classified() -> None:
    model_names = (
        "Mistral-Large-Instruct-2411",
        "Mixtral-8x22B-Instruct-v0.1",
        "Jamba-1.5-Large",
        "Phi3-medium-4k",
        "MAmmoTH2-8B-Plus",
        "Yi-1.5-34B-Chat",
        "Granite-3.1-8B-Instruct",
        "Aya-Expanse-32B",
        "c4ai-command-r-v01",
        "Staring-7B",
    )
    assert all(_known_family_license(name, "Unknown") == "Open" for name in model_names)


def test_recent_verified_service_only_models_are_classified() -> None:
    assert _known_family_license("Pine Voice Preview", "Pine AI") == "Proprietary"
    assert _known_family_license("KAT Coder Pro V2", "KwaiKAT") == "Proprietary"
    assert _known_family_license("Seed2.0-Lite", "ByteDance") == "Proprietary"
    assert _known_family_license("Hunyuan-T1", "Tencent") == "Proprietary"
    assert _known_family_license("xai-realtime (enabled)", "xAI") == "Proprietary"
    assert _known_family_license("RAFT-30B-A3B", "Northeastern University HAI Lab") == (
        "Proprietary"
    )
    assert _known_family_license("Yi-Lightning", "01.AI") == "Proprietary"
    assert _known_family_license("Yi-large", "01.AI") == "Proprietary"


def test_non_model_baseline_is_not_treated_as_unknown_model() -> None:
    assert _known_family_license("Cascaded baseline", "Multiple providers") == ("Not applicable")
    assert _known_family_license("Distyl ButtonAgent (high)", "Distyl AI") == ("Not applicable")
    assert _known_family_license("Brokk + Sonnet4.5 (Standard) + Flash3 (Minimal)", "Brokk") == (
        "Not applicable"
    )


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
