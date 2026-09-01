from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

EVENT_CATEGORIES: dict[str, str] = {
    "model_release": "Model Release",
    "model_update": "Model Update",
    "ai_agent": "AI Agent",
    "benchmark": "Benchmark",
    "research": "Research",
    "product_launch": "Product Launch",
    "funding": "Funding",
    "acquisition": "Acquisition",
    "partnership": "Partnership",
    "infrastructure": "Infrastructure",
    "regulation": "Regulation",
    "security": "Security",
    "pricing_change": "Pricing Change",
    "api_update": "API Update",
}

_TYPE_CATEGORIES = {
    "model.released": "model_release",
    "model.updated": "model_update",
    "model.deprecated": "model_update",
    "model.version_changed": "model_update",
    "context.changed": "model_update",
    "capability.changed": "model_update",
    "license.changed": "model_update",
    "weights.released": "model_update",
    "huggingface.updated": "model_update",
    "price.changed": "pricing_change",
    "cache_price.changed": "pricing_change",
    "benchmark.updated": "benchmark",
    "leaderboard.changed": "benchmark",
    "research.published": "research",
    "github.release_published": "product_launch",
    "agent.updated": "ai_agent",
    "product.launched": "product_launch",
    "funding.announced": "funding",
    "acquisition.announced": "acquisition",
    "partnership.announced": "partnership",
    "infrastructure.updated": "infrastructure",
    "regulation.updated": "regulation",
    "security.advisory": "security",
    "api.updated": "api_update",
}

_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("security", ("security", "vulnerability", "cve", "exploit", "güvenlik")),
    ("regulation", ("regulation", "law", "policy", "act", "regülasyon", "yasa")),
    ("acquisition", ("acquisition", "acquire", "satın al")),
    ("funding", ("funding", "series a", "series b", "investment", "yatırım")),
    ("partnership", ("partnership", "partner", "iş birliği", "collaboration")),
    ("product_launch", ("launch", "introducing", "unveil", "duyurdu", "released")),
    ("api_update", ("api", "sdk", "endpoint")),
    ("ai_agent", ("agent", "tool use", "computer use", "browser use", "mcp")),
    ("infrastructure", ("infrastructure", "datacenter", "cluster", "gpu", "platform")),
    ("research", ("research", "paper", "study", "araştırma")),
)


def classify_event(event_type: str, title: str = "", payload: dict[str, Any] | None = None) -> str:
    mapped = _TYPE_CATEGORIES.get(event_type)
    if mapped:
        return mapped
    haystack = " ".join(
        (title, str((payload or {}).get("title") or ""), str((payload or {}).get("summary") or ""))
    ).lower()
    for category, keywords in _KEYWORDS:
        if any(keyword in haystack for keyword in keywords):
            return category
    return "model_update"


@dataclass(frozen=True, slots=True)
class ImportanceResult:
    score: int
    level: str
    factors: dict[str, Any]


_BASE_SCORES = {
    "model.released": 20,
    "model.deprecated": 40,
    "price.changed": 18,
    "cache_price.changed": 8,
    "context.changed": 15,
    "capability.changed": 20,
    "license.changed": 18,
    "weights.released": 20,
    "benchmark.updated": 18,
    "leaderboard.changed": 20,
    "research.published": 12,
    "product.launched": 22,
    "funding.announced": 18,
    "acquisition.announced": 25,
    "partnership.announced": 15,
    "regulation.updated": 25,
    "security.advisory": 30,
    "api.updated": 15,
    "agent.updated": 20,
}

_RELIABILITY_POINTS = {
    "official_api": 20,
    "official_document": 18,
    "independent_measurement": 17,
    "academic": 16,
    "third_party": 12,
    "community": 7,
    "unverified": 2,
}

_SECTOR_POINTS = {
    "model_release": 12,
    "ai_agent": 12,
    "benchmark": 8,
    "product_launch": 10,
    "funding": 6,
    "acquisition": 12,
    "infrastructure": 8,
    "regulation": 14,
    "security": 16,
    "pricing_change": 8,
    "api_update": 7,
    "model_update": 5,
    "research": 6,
    "partnership": 7,
}


def _percentage(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return abs(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        return None


def score_importance(
    event_type: str,
    payload: dict[str, Any] | None = None,
    *,
    title: str = "",
    reliability: str = "unverified",
    verification_status: str = "source_asserted",
) -> ImportanceResult:
    payload = payload or {}
    category = classify_event(event_type, title, payload)
    factors: dict[str, Any] = {
        "event": _BASE_SCORES.get(event_type, 10),
        "source_reliability": _RELIABILITY_POINTS.get(reliability, 2),
        "sector_impact": _SECTOR_POINTS.get(category, 4),
    }
    if event_type == "model.released":
        factors["new_model"] = 18
    if event_type in {"capability.changed", "weights.released", "agent.updated"}:
        factors["new_capability"] = 14
    change = _percentage(payload.get("change_percentage"))
    if change is not None:
        factors["change_magnitude"] = (
            22 if change >= 50 else 14 if change >= 20 else 7 if change >= 10 else 2
        )
    rank = payload.get("rank") or (payload.get("new_value") or {}).get("rank")
    if isinstance(rank, int):
        factors["benchmark_impact"] = 22 if rank == 1 else 14 if rank <= 10 else 5
    factors["verification"] = {
        "official": 12,
        "corroborated": 16,
        "source_asserted": 6,
        "unverified": 0,
    }.get(verification_status, 0)
    score = min(100, sum(value for value in factors.values() if isinstance(value, int)))
    level = (
        "critical"
        if score >= 80
        else "high"
        if score >= 60
        else "medium"
        if score >= 35
        else "low"
        if score >= 15
        else "info"
    )
    return ImportanceResult(score=score, level=level, factors={**factors, "category": category})
