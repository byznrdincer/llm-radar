import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from typing import Any, cast

RADAR_SCORE_VERSION = "radar-score-v1.0"
RADAR_CATEGORY_WEIGHTS = {
    "general": 20,
    "reasoning": 15,
    "coding": 20,
    "agentic": 15,
    "knowledge": 10,
    "preference": 20,
}
RADAR_SCORE_BENCHMARKS = {
    "arena-text": ("preference", "Arena Text"),
    "artificial-analysis-intelligence": ("general", "AA Intelligence"),
    "livebench-overall": ("general", "LiveBench Overall"),
    "livebench-reasoning": ("reasoning", "LiveBench Reasoning"),
    "swe-bench-verified": ("coding", "SWE-bench Verified"),
    "artificial-analysis-coding": ("coding", "AA Coding"),
    "livecodebench-code-generation": ("coding", "LiveCodeBench"),
    "artificial-analysis-agentic": ("agentic", "AA Agentic"),
    "tau-bench-airline": ("agentic", "τ-bench Airline"),
    "mmlu-pro-overall": ("knowledge", "MMLU-Pro"),
}
RADAR_MINIMUM_BENCHMARKS = 2
RADAR_MINIMUM_CATEGORIES = 2

WEIGHTS = {
    "arena-text": 25,
    "swe-bench-verified": 20,
    "artificial-analysis-intelligence": 15,
    "artificial-analysis-coding": 10,
    "artificial-analysis-agentic": 10,
    "livebench-overall": 15,
    "mmlu-pro-overall": 5,
}

LABELS = {
    "arena-text": "Arena",
    "swe-bench-verified": "SWE-bench Verified",
    "artificial-analysis-intelligence": "AA Zekâ",
    "artificial-analysis-coding": "AA Kodlama",
    "artificial-analysis-agentic": "AA Agentic",
    "livebench-overall": "LiveBench",
    "mmlu-pro-overall": "MMLU-Pro",
}

_NOISE = {
    "adaptive",
    "reasoning",
    "effort",
    "high",
    "xhigh",
    "medium",
    "low",
    "max",
    "thinking",
    "nonthinking",
    "non",
    "batch",
}


@dataclass(frozen=True)
class CompositeInput:
    benchmark: str
    model_name: str
    organization: str
    rank: int
    field_size: int
    published_at: date


@dataclass(frozen=True)
class RadarScoreInput:
    benchmark: str
    model_name: str
    organization: str
    rank: int
    field_size: int
    published_at: date
    identity_key: str | None = None
    catalog_model_id: str | None = None


def radar_methodology() -> dict[str, Any]:
    """Public, versioned description of the Radar composite index."""
    return {
        "version": RADAR_SCORE_VERSION,
        "score_type": "composite_index",
        "is_first_party_evaluation": False,
        "normalization": (
            "Her benchmark kendi güncel sıralaması içinde 0–100 rank yüzdeliğine "
            "dönüştürülür; farklı ölçeklerdeki ham puanlar toplanmaz."
        ),
        "aggregation": (
            "Benchmarklar önce kategori içinde ortalanır, ardından kategori "
            "ağırlıklarıyla birleştirilir."
        ),
        "missing_data": (
            "Eksik ölçüm sıfır kabul edilmez. Mevcut kategoriler ortalanır ve "
            "kapsam azaldıkça skora açık bir kapsam cezası uygulanır."
        ),
        "minimum_coverage": {
            "benchmarks": RADAR_MINIMUM_BENCHMARKS,
            "categories": RADAR_MINIMUM_CATEGORIES,
        },
        "category_weights": RADAR_CATEGORY_WEIGHTS,
        "benchmarks": {
            slug: {"category": category, "label": label}
            for slug, (category, label) in RADAR_SCORE_BENCHMARKS.items()
        },
    }


def _ascii(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()


@lru_cache(maxsize=8192)
def canonical_model_name(value: str) -> str:
    """Match formatting/effort variants without merging distinct model generations."""
    clean = _ascii(value).split(":", 1)[-1]
    clean = re.sub(r"\([^)]*\)", " ", clean)
    tokens = re.findall(r"[a-z]+|\d+(?:\.\d+)?", clean)
    tokens = [
        token
        for token in tokens
        if token not in _NOISE and not (token.isdigit() and len(token) == 8)
    ]
    if tokens[:3] and tokens[0] == "claude" and len(tokens) >= 3:
        # SWE-bench uses "Claude 4.5 Opus" while other sources use "Claude Opus 4.5".
        tokens = [tokens[0], *sorted(tokens[1:])]
    return " ".join(tokens)


def display_model_name(value: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", value).strip()


def build_composite(rows: Iterable[CompositeInput]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, CompositeInput]] = defaultdict(dict)
    names: dict[str, tuple[str, str]] = {}
    name_priorities: dict[str, int] = {}
    dates: dict[str, date] = {}

    for row in rows:
        if row.benchmark not in WEIGHTS or row.field_size < 2:
            continue
        key = canonical_model_name(row.model_name)
        if not key:
            continue
        current = grouped[key].get(row.benchmark)
        if current is None or row.rank < current.rank:
            grouped[key][row.benchmark] = row
        priority = 3 if row.benchmark.startswith("artificial-analysis") else 1
        if row.benchmark == "artificial-analysis-intelligence":
            priority = 4
        elif row.benchmark == "swe-bench-verified":
            priority = 2
        if priority > name_priorities.get(key, 0):
            names[key] = (display_model_name(row.model_name), row.organization)
            name_priorities[key] = priority
        dates[key] = max(dates.get(key, row.published_at), row.published_at)

    results = []
    for key, dimensions in grouped.items():
        if len(dimensions) < 2:
            continue
        weighted_points = 0.0
        available_weight = 0
        breakdown = []
        for benchmark, row in dimensions.items():
            weight = WEIGHTS[benchmark]
            percentile = 100 * (1 - (row.rank - 1) / (row.field_size - 1))
            weighted_points += percentile * weight
            available_weight += weight
            breakdown.append(
                {
                    "source": LABELS[benchmark],
                    "benchmark": benchmark,
                    "rank": row.rank,
                    "field_size": row.field_size,
                    "normalized_score": round(percentile, 1),
                    "weight": weight,
                }
            )
        coverage = available_weight / 100
        available_average = weighted_points / available_weight
        score = available_average * (0.65 + 0.35 * coverage)
        model_name, organization = names[key]
        results.append(
            {
                "model_name": model_name,
                "organization": organization,
                "score": round(score, 1),
                "coverage": round(coverage * 100),
                "source_count": len(dimensions),
                "published_at": dates[key],
                "breakdown": sorted(breakdown, key=lambda item: -cast(int, item["weight"])),
            }
        )

    results.sort(
        key=lambda item: (
            -cast(float, item["score"]),
            -cast(int, item["coverage"]),
            str(item["model_name"]),
        )
    )
    for rank, item in enumerate(results, start=1):
        item["rank"] = rank
    return results


def _radar_identity(row: RadarScoreInput) -> str:
    if row.identity_key:
        return row.identity_key
    return f"{canonical_model_name(row.organization)}::{canonical_model_name(row.model_name)}"


def build_radar_scores(
    rows: Iterable[RadarScoreInput],
    *,
    minimum_benchmarks: int = RADAR_MINIMUM_BENCHMARKS,
    minimum_categories: int = RADAR_MINIMUM_CATEGORIES,
) -> dict[str, Any]:
    """Build a scale-independent, category-balanced 0–100 composite index.

    This is intentionally an index over third-party benchmark snapshots, not a
    first-party evaluation. Models below the declared evidence threshold are
    reported as ineligible instead of receiving an invented score.
    """
    valid_rows = [
        row
        for row in rows
        if row.benchmark in RADAR_SCORE_BENCHMARKS
        and row.rank > 0
        and row.field_size > 1
        and canonical_model_name(row.model_name)
    ]
    active_benchmarks = {row.benchmark for row in valid_rows}
    active_by_category: dict[str, set[str]] = defaultdict(set)
    for benchmark in active_benchmarks:
        category, _label = RADAR_SCORE_BENCHMARKS[benchmark]
        active_by_category[category].add(benchmark)

    grouped: dict[str, dict[str, RadarScoreInput]] = defaultdict(dict)
    display: dict[str, tuple[str, str, str | None]] = {}
    latest_dates: dict[str, date] = {}
    for row in valid_rows:
        identity = _radar_identity(row)
        current = grouped[identity].get(row.benchmark)
        if current is None or row.rank < current.rank:
            grouped[identity][row.benchmark] = row
        display.setdefault(
            identity,
            (display_model_name(row.model_name), row.organization, row.catalog_model_id),
        )
        if row.catalog_model_id and display[identity][2] is None:
            display[identity] = (
                display[identity][0],
                display[identity][1],
                row.catalog_model_id,
            )
        latest_dates[identity] = max(latest_dates.get(identity, row.published_at), row.published_at)

    scored: list[dict[str, Any]] = []
    ineligible: list[dict[str, Any]] = []
    total_category_weight = sum(
        RADAR_CATEGORY_WEIGHTS[category]
        for category in active_by_category
        if active_by_category[category]
    )

    for identity, dimensions in grouped.items():
        category_points: dict[str, list[float]] = defaultdict(list)
        breakdown: list[dict[str, Any]] = []
        for benchmark, row in dimensions.items():
            category, label = RADAR_SCORE_BENCHMARKS[benchmark]
            normalized = 100 * (1 - (row.rank - 1) / (row.field_size - 1))
            normalized = max(0.0, min(100.0, normalized))
            category_points[category].append(normalized)
            breakdown.append(
                {
                    "benchmark": benchmark,
                    "label": label,
                    "category": category,
                    "rank": row.rank,
                    "field_size": row.field_size,
                    "normalized_score": round(normalized, 1),
                    "published_at": row.published_at,
                }
            )

        category_scores = {
            category: round(sum(points) / len(points), 1)
            for category, points in category_points.items()
        }
        available_weight = sum(RADAR_CATEGORY_WEIGHTS[category] for category in category_scores)
        weighted_score = (
            sum(
                category_scores[category] * RADAR_CATEGORY_WEIGHTS[category]
                for category in category_scores
            )
            / available_weight
        )
        coverage_weight = 0.0
        for category, benchmarks in active_by_category.items():
            category_weight = RADAR_CATEGORY_WEIGHTS[category]
            present = len(benchmarks.intersection(dimensions))
            coverage_weight += category_weight * present / len(benchmarks)
        coverage = coverage_weight / total_category_weight if total_category_weight else 0.0
        eligible = (
            len(dimensions) >= minimum_benchmarks and len(category_scores) >= minimum_categories
        )
        score = weighted_score * (0.75 + 0.25 * coverage) if eligible else None
        model_name, organization, catalog_model_id = display[identity]
        item = {
            "identity_key": identity,
            "catalog_model_id": catalog_model_id,
            "model_name": model_name,
            "organization": organization,
            "score": round(score, 1) if score is not None else None,
            "coverage": round(coverage * 100),
            "benchmark_count": len(dimensions),
            "category_count": len(category_scores),
            "eligible": eligible,
            "published_at": latest_dates[identity],
            "category_scores": category_scores,
            "breakdown": sorted(
                breakdown,
                key=lambda item: (
                    -RADAR_CATEGORY_WEIGHTS[cast(str, item["category"])],
                    cast(str, item["label"]),
                ),
            ),
        }
        (scored if eligible else ineligible).append(item)

    scored.sort(
        key=lambda item: (
            -cast(float, item["score"]),
            -cast(int, item["coverage"]),
            cast(str, item["model_name"]).lower(),
        )
    )
    for rank, item in enumerate(scored, start=1):
        item["rank"] = rank
    return {
        "items": scored,
        "eligible_count": len(scored),
        "ineligible_count": len(ineligible),
        "active_benchmarks": sorted(active_benchmarks),
        "methodology": radar_methodology(),
    }
