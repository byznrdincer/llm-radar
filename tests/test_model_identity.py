from llm_radar.model_identity import model_variant_identity


def test_model_variant_identity_groups_hosting_and_precision_variants() -> None:
    base = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    assert model_variant_identity(f"{base}:free") == base
    assert model_variant_identity(f"{base}-BF16") == base
    assert model_variant_identity(f"{base}-FP8") == base
    assert model_variant_identity(f"{base}-NVFP4") == base


def test_model_variant_identity_keeps_behavior_variants_distinct() -> None:
    assert model_variant_identity("qwen/qwen3:thinking") == "qwen/qwen3:thinking"
