import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from typing import Any, cast

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


def _ascii(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()


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
