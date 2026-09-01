from llm_radar.model_family import infer_model_family


def test_model_family_is_inferred_from_canonical_name_or_slug() -> None:
    assert infer_model_family("OpenAI: GPT-5 Mini", "openai/gpt-5-mini") == "GPT"
    assert infer_model_family("Anthropic: Claude Opus 4", "anthropic/claude-opus-4") == "Claude"
    assert infer_model_family("Qwen3 Coder", "qwen/qwen3-coder") == "Qwen"
