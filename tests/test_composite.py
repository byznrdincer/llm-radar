from datetime import date

from llm_radar.composite import (
    CompositeInput,
    RadarScoreInput,
    build_composite,
    build_radar_scores,
    canonical_model_name,
    display_model_name,
    radar_methodology,
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


def radar_row(source: str, name: str, rank: int, size: int = 10) -> RadarScoreInput:
    return RadarScoreInput(source, name, "Test", rank, size, date(2026, 8, 13))


def test_radar_score_balances_categories_and_reports_coverage() -> None:
    result = build_radar_scores(
        [
            radar_row("arena-text", "Model A", 1),
            radar_row("swe-bench-verified", "Model A", 2),
            radar_row("artificial-analysis-coding", "Model A", 1),
            radar_row("arena-text", "Model B", 2),
            radar_row("swe-bench-verified", "Model B", 1),
            radar_row("artificial-analysis-coding", "Model B", 1),
            radar_row("mmlu-pro-overall", "Model B", 1),
        ]
    )

    assert result["items"][0]["model_name"] == "Model B"
    assert 0 <= result["items"][0]["score"] <= 100
    assert result["items"][0]["category_count"] == 3
    assert result["items"][0]["coverage"] > result["items"][1]["coverage"]
    assert result["methodology"]["is_first_party_evaluation"] is False


def test_radar_score_does_not_invent_score_below_minimum_coverage() -> None:
    result = build_radar_scores([radar_row("arena-text", "Model A", 1)])

    assert result["items"] == []
    assert result["ineligible_count"] == 1


def test_radar_methodology_is_versioned_and_documents_missing_data() -> None:
    methodology = radar_methodology()

    assert methodology["version"] == "radar-score-v1.0"
    assert methodology["minimum_coverage"] == {"benchmarks": 2, "categories": 2}
    assert "Eksik ölçüm sıfır kabul edilmez" in methodology["missing_data"]
