from collections.abc import Mapping
from datetime import date
from typing import Any

from llm_radar.catalog import RANKING_CATEGORIES, VALUE_SCENARIOS
from llm_radar.composite import CompositeInput, build_composite, canonical_model_name

CATEGORY_BENCHMARKS = {
    "general": ("arena-text", "artificial-analysis-intelligence", "livebench-overall"),
    "reasoning": ("livebench-reasoning", "mmlu-pro-overall"),
    "coding": ("swe-bench-verified", "livecodebench-code-generation", "artificial-analysis-coding"),
    "agent": ("tau-bench-airline", "artificial-analysis-agentic"),
    "computer_use": ("tau-bench-airline",),
    "multimodal": ("arena-text",),
    "open_weight": ("arena-text", "swe-bench-verified"),
}


def ranking_catalog() -> list[dict[str, Any]]:
    return [
        {
            "category": category,
            "benchmarks": list(CATEGORY_BENCHMARKS.get(category, ())),
            "formula": (
                "Per-benchmark rank percentile, coverage-weighted. Missing data is not imputed."
            ),
        }
        for category in RANKING_CATEGORIES
    ]


def rank_category(rows: list[CompositeInput], category: str) -> list[dict[str, Any]]:
    allowed = set(CATEGORY_BENCHMARKS.get(category, ()))
    filtered = [row for row in rows if not allowed or row.benchmark in allowed]
    return build_composite(filtered)


def value_score(
    *,
    quality: float | None,
    input_price: float | None,
    output_price: float | None,
    cache: float | None = None,
    speed: float | None = None,
    context: float | None = None,
    reliability: float | None = None,
    tool_use: float | None = None,
    modality: float | None = None,
    license_open: float | None = None,
    open_weight: float | None = None,
    latency: float | None = None,
    scenario: str = "chat",
    weights: Mapping[str, float] | None = None,
) -> dict[str, Any]:
    chosen = dict(weights or VALUE_SCENARIOS.get(scenario, VALUE_SCENARIOS["chat"]))
    metrics = {
        "quality": quality,
        "input_price": None if input_price is None else max(0.0, 100 - input_price),
        "output_price": None if output_price is None else max(0.0, 100 - output_price),
        "cache": None if cache is None else max(0.0, 100 - cache),
        "speed": speed,
        "context": None if context is None else min(100.0, context / 2000),
        "reliability": reliability,
        "tool_use": tool_use,
        "modality": modality,
        "license": license_open,
        "open_weight": open_weight,
        "latency": None if latency is None else max(0.0, 100 - latency / 20),
    }
    weighted = 0.0
    available = 0.0
    breakdown = []
    for key, weight in chosen.items():
        value = metrics.get(key)
        if value is None:
            continue
        weighted += value * weight
        available += weight
        breakdown.append({"metric": key, "weight": weight, "score": round(value, 2)})
    coverage = available / sum(chosen.values()) if chosen else 0
    score = (weighted / available) * (0.65 + 0.35 * coverage) if available else None
    return {
        "scenario": scenario,
        "score": round(score, 1) if score is not None else None,
        "coverage": round(coverage * 100),
        "weights": chosen,
        "breakdown": breakdown,
        "formula": (
            "Available-metric weighted average with 35% coverage penalty. "
            "Missing metrics are omitted, never invented."
        ),
    }


def snapshot_to_inputs(rows: list[Any], field_sizes: dict[str, int]) -> list[CompositeInput]:
    inputs: list[CompositeInput] = []
    for row in rows:
        inputs.append(
            CompositeInput(
                benchmark=row.benchmark_slug if hasattr(row, "benchmark_slug") else row[0],
                model_name=row.model_external_id if hasattr(row, "model_external_id") else row[1],
                organization=row.organization if hasattr(row, "organization") else row[2],
                rank=row.rank if hasattr(row, "rank") else row[3],
                field_size=field_sizes.get(
                    row.benchmark_slug if hasattr(row, "benchmark_slug") else row[0], 2
                ),
                published_at=row.published_at
                if hasattr(row, "published_at")
                else row[4] or date.today(),
            )
        )
    return inputs


def model_value_from_record(
    model_name: str,
    pricing: dict[str, Any] | None,
    context: int | None,
    scenario: str,
    weights: Mapping[str, float] | None = None,
) -> dict[str, Any]:
    pricing = pricing or {}
    input_price = float(pricing["input"]) if pricing.get("input") not in (None, "") else None
    output_price = float(pricing["output"]) if pricing.get("output") not in (None, "") else None
    cache = float(pricing["cache_read"]) if pricing.get("cache_read") not in (None, "") else None
    result = value_score(
        quality=None,
        input_price=input_price,
        output_price=output_price,
        cache=cache,
        context=float(context) if context else None,
        scenario=scenario,
        weights=weights,
    )
    result["model_name"] = model_name
    result["canonical_name"] = canonical_model_name(model_name)
    return result
