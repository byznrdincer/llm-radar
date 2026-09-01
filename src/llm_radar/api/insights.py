from collections import defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.database.models import (
    BenchmarkDefinition,
    Company,
    LeaderboardSnapshot,
    Model,
    ModelProfile,
    ModelSnapshot,
)
from llm_radar.database.session import get_db

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
    "istanbul technical",
    "itü",
)


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


@router.get("/models/turkish", tags=["models"])
def turkish_models(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    rows = session.execute(
        select(Model, Company, ModelProfile)
        .join(Company, Company.id == Model.company_id)
        .outerjoin(ModelProfile, ModelProfile.model_id == Model.id)
    ).all()
    candidates: list[tuple[Model, Company, ModelProfile | None]] = []
    for model, company, profile in rows:
        haystack = " ".join(
            [model.name, model.slug, company.name, company.slug, str(model.capabilities)]
        ).lower()
        if any(signal in haystack for signal in TURKISH_SIGNALS):
            candidates.append((model, company, profile))
    model_ids = [model.id for model, _, _ in candidates[:limit]]
    snapshots: dict[Any, ModelSnapshot] = {}
    for model_id in model_ids:
        snapshot = session.scalar(
            select(ModelSnapshot)
            .where(ModelSnapshot.model_id == model_id)
            .order_by(ModelSnapshot.observed_at.desc())
            .limit(1)
        )
        if snapshot is not None:
            snapshots[model_id] = snapshot
    return {
        "selection_note": (
            "Türkçe/Türkiye sinyali model adı, geliştirici veya kaynak etiketinden gelir."
        ),
        "items": [
            {
                "id": str(model.id),
                "name": model.name,
                "organization": company.name,
                "base_model": (
                    snapshots.get(model.id).data.get("base_model")
                    if model.id in snapshots
                    else None
                ),
                "parameter_count": model.parameter_count,
                "license": profile.license if profile else model.license,
                "downloads": (
                    snapshots.get(model.id).data.get("downloads") if model.id in snapshots else None
                ),
                "likes": (
                    snapshots.get(model.id).data.get("likes") if model.id in snapshots else None
                ),
                "last_updated": profile.observed_at if profile else model.updated_at,
            }
            for model, company, profile in candidates[:limit]
        ],
    }
