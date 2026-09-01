from collections import defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import (
    BenchmarkDefinition,
    Company,
    LeaderboardSnapshot,
    Model,
    ModelProfile,
    ModelSnapshot,
)
from llm_radar.database.session import get_db
from llm_radar.model_selection import benchmark_matches

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]

USA_ORGANIZATIONS = {
    "amazon",
    "anthropic",
    "google",
    "meta",
    "microsoft",
    "nvidia",
    "openai",
    "xai",
}
CHINA_ORGANIZATIONS = {
    "alibaba",
    "baidu",
    "bytedance",
    "deepseek",
    "minimax",
    "moonshot",
    "qwen",
    "tencent",
    "z.ai",
    "zhipu",
    "zhipu ai",
}
TURKISH_SIGNALS = (
    "turkish",
    "türkçe",
    "turkce",
    "tubitak",
    "tübitak",
    "turkcell",
    "havelsan",
    "trendyol",
    "ytu",
    "yıldız teknik",
    "yildiz teknik",
    "istanbul technical",
    "itü",
    "turna",
    "vngrs",
    "vbt-llm",
    "vbart",
    "kartalbt",
    "odmdata",
    "turkiye",
    "türkiye",
    "turkey",
    "mizan",
    "wiroai",
    "turkcell-llm",
)


def _turkish_haystack(
    model: Model,
    company: Company,
    profile: ModelProfile | None,
    snapshot: ModelSnapshot | None,
) -> str:
    parts = [
        model.name,
        model.slug,
        company.name,
        company.slug,
        str(model.capabilities),
    ]
    if profile and profile.capabilities:
        parts.append(str(profile.capabilities))
    if snapshot and snapshot.data:
        for key in ("tags", "tasks", "description", "model_card", "organization"):
            value = snapshot.data.get(key)
            if value not in (None, ""):
                parts.append(str(value))
    return " ".join(parts).lower()


def _is_turkish_model(
    model: Model,
    company: Company,
    profile: ModelProfile | None,
    snapshot: ModelSnapshot | None,
) -> bool:
    haystack = _turkish_haystack(model, company, profile, snapshot)
    return any(signal in haystack for signal in TURKISH_SIGNALS)


def _organization_region(value: str) -> str | None:
    normalized = value.strip().lower()
    if any(name in normalized for name in USA_ORGANIZATIONS):
        return "USA"
    if any(name in normalized for name in CHINA_ORGANIZATIONS):
        return "China"
    return None


@router.get("/insights/country-frontier", tags=["insights"])
def country_frontier(
    session: DatabaseSession,
    benchmark: str = "arena-text",
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> dict[str, Any]:
    definition = session.scalar(
        select(BenchmarkDefinition).where(BenchmarkDefinition.slug == benchmark)
    )
    if definition is None:
        return {"benchmark": benchmark, "metric": "Arena Rating", "published_at": None, "items": []}
    published_at = session.scalar(
        select(func.max(LeaderboardSnapshot.published_at)).where(
            LeaderboardSnapshot.benchmark_id == definition.id
        )
    )
    if published_at is None:
        return {"benchmark": benchmark, "metric": "Arena Rating", "published_at": None, "items": []}
    rows = session.scalars(
        select(LeaderboardSnapshot)
        .where(
            LeaderboardSnapshot.benchmark_id == definition.id,
            LeaderboardSnapshot.published_at == published_at,
        )
        .order_by(LeaderboardSnapshot.score.desc())
    ).all()
    items: list[dict[str, Any]] = []
    region_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        region = _organization_region(row.organization)
        if region is None or region_counts[region] >= limit:
            continue
        items.append(
            {
                "region": region,
                "model": row.model_external_id,
                "organization": row.organization,
                "score": float(row.score),
            }
        )
        region_counts[region] += 1
    return {
        "benchmark": definition.name,
        "metric": "Arena Rating — yüksek daha iyi",
        "published_at": published_at,
        "items": items,
    }


@router.get("/models/turkish", tags=["models"])
def turkish_models(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    return list_turkish_models(session, limit)


@router.get("/insights/openness-trend", tags=["insights"])
def openness_trend(session: DatabaseSession) -> dict[str, Any]:
    rows = session.execute(
        select(Model.release_date, ModelProfile.openness)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
        .where(Model.release_date.is_not(None))
    ).all()
    points: dict[int, dict[str, int]] = defaultdict(
        lambda: {"open_source": 0, "open_weight": 0, "proprietary": 0, "unknown": 0}
    )
    for release_date, openness in rows:
        points[release_date.year][openness or "unknown"] += 1
    return {
        "metric": "Katalogdaki yayınlanan model sayısı",
        "interpretation": "Performans skoru değildir; yayın hacmini ve katalog kapsamını gösterir.",
        "items": [{"year": year, **counts} for year, counts in sorted(points.items())],
    }


def list_turkish_models(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    rows = session.execute(
        select(Model, Company, ModelProfile)
        .join(Company, Company.id == Model.company_id)
        .outerjoin(ModelProfile, ModelProfile.model_id == Model.id)
    ).all()
    benchmark_index = benchmark_matches(session, "general")
    candidates: list[tuple[Model, Company, ModelProfile | None, ModelSnapshot | None, int]] = []
    for model, company, profile in rows:
        snapshot = session.scalar(
            select(ModelSnapshot)
            .where(ModelSnapshot.model_id == model.id)
            .order_by(ModelSnapshot.observed_at.desc())
            .limit(1)
        )
        if not _is_turkish_model(model, company, profile, snapshot):
            continue
        downloads = (
            int(snapshot.data.get("downloads"))
            if snapshot and isinstance(snapshot.data.get("downloads"), int)
            else 0
        )
        candidates.append((model, company, profile, snapshot, downloads))
    candidates.sort(key=lambda item: item[4], reverse=True)
    return {
        "selection_note": (
            "Türkçe/Türkiye sinyali model adı, geliştirici, HF etiketleri veya kaynak metadata'sından gelir."
        ),
        "items": [
            {
                "id": str(model.id),
                "name": model.name,
                "organization": company.name,
                "base_model": (
                    snapshot.data.get("base_model")
                    if snapshot and isinstance(snapshot.data, dict)
                    else None
                ),
                "parameter_count": model.parameter_count,
                "license": profile.license if profile else model.license,
                "downloads": (
                    snapshot.data.get("downloads")
                    if snapshot and isinstance(snapshot.data, dict)
                    else None
                ),
                "likes": (
                    snapshot.data.get("likes")
                    if snapshot and isinstance(snapshot.data, dict)
                    else None
                ),
                "benchmark_score": (
                    benchmark_index[canonical_model_name(model.name)].score
                    if canonical_model_name(model.name) in benchmark_index
                    else None
                ),
                "last_updated": profile.observed_at if profile else model.updated_at,
            }
            for model, company, profile, snapshot, _downloads in candidates[:limit]
        ],
    }
