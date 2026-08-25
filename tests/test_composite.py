from datetime import date

from llm_radar.composite import (
    CompositeInput,
    build_composite,
    canonical_model_name,
    display_model_name,
)


def row(source: str, name: str, rank: int, size: int = 10) -> CompositeInput:
    return CompositeInput(source, name, "Test", rank, size, date(2026, 8, 13))


def test_canonical_name_matches_claude_word_order_and_effort() -> None:
    assert canonical_model_name("Claude 4.5 Opus") == canonical_model_name(
        "Claude Opus 4.5 (Adaptive Reasoning, Max Effort)"
    )
    assert display_model_name("Claude Opus 5 (Adaptive Reasoning, Max Effort)") == ("Claude Opus 5")
    assert canonical_model_name("OpenAI: GPT-5.6 Sol") == canonical_model_name(
        "GPT-5.6 Sol (xhigh)"
    )


def test_composite_rewards_cross_source_strength_and_reports_breakdown() -> None:
    results = build_composite(
        [
            row("arena-text", "Model A", 1),
            row("swe-bench-verified", "Model A", 2),
            row("artificial-analysis-intelligence", "Model B", 1),
            row("artificial-analysis-coding", "Model B", 1),
            row("arena-text", "Model B", 10),
        ]
    )
    assert results[0]["model_name"] == "Model A"
    assert results[0]["rank"] == 1
    assert results[0]["coverage"] == 45
    assert len(results[0]["breakdown"]) == 2
