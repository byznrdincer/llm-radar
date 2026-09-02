from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
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
    PriceObservation,
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
    "zai",
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

MARKET_BENCHMARKS = {
    "arena-text": {
        "label": "Arena Rating",
        "metric": "Arena Rating — yüksek daha iyi",
    },
    "artificial-analysis-intelligence": {
        "label": "AA Intelligence Index",
        "metric": "Intelligence Index — yüksek daha iyi",
    },
}


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


def _next_month(value: date) -> date:
    if value.month == 12:
        return date(value.year + 1, 1, 1)
    return date(value.year, value.month + 1, 1)


def _count_models_between(session: Session, start: date, end: date) -> int:
    return (
        session.scalar(
            select(func.count(Model.id)).where(
                Model.release_date >= start,
                Model.release_date < end,
            )
        )
        or 0
    )


@router.get("/insights/market-dashboard", tags=["insights"])
def market_dashboard(
    session: DatabaseSession,
    benchmark: str = "arena-text",
    days: Annotated[int, Query(ge=30, le=3650)] = 365,
) -> dict[str, Any]:
    """Return evidence-backed market KPIs and time series for the analysis dashboard."""
    definition = session.scalar(
        select(BenchmarkDefinition).where(BenchmarkDefinition.slug == benchmark)
    )
    benchmark_meta = MARKET_BENCHMARKS.get(
        benchmark,
        {
            "label": definition.name if definition else benchmark,
            "metric": f"{definition.name if definition else benchmark} — yüksek daha iyi",
        },
    )
    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days)
    rows: list[LeaderboardSnapshot] = []
    if definition is not None:
        rows = session.scalars(
            select(LeaderboardSnapshot)
            .where(
                LeaderboardSnapshot.benchmark_id == definition.id,
                LeaderboardSnapshot.published_at >= cutoff,
            )
            .order_by(
                LeaderboardSnapshot.published_at.asc(),
                LeaderboardSnapshot.score.desc(),
            )
        ).all()

    by_date: dict[date, dict[str, dict[str, Any]]] = defaultdict(dict)
    model_history: dict[tuple[str, str], dict[date, LeaderboardSnapshot]] = defaultdict(dict)
    for row in rows:
        region = _organization_region(row.organization)
        if region is None:
            continue
        current = by_date[row.published_at].get(region)
        if current is None or float(row.score) > current["score"]:
            by_date[row.published_at][region] = {
                "score": float(row.score),
                "model": row.model_external_id,
                "organization": row.organization,
            }
        model_key = (row.organization, row.model_external_id)
        previous = model_history[model_key].get(row.published_at)
        if previous is None or row.score > previous.score:
            model_history[model_key][row.published_at] = row

    country_trend = [
        {
            "date": published_at,
            "usa": values.get("USA", {}).get("score"),
            "china": values.get("China", {}).get("score"),
            "usa_model": values.get("USA", {}).get("model"),
            "china_model": values.get("China", {}).get("model"),
            "usa_organization": values.get("USA", {}).get("organization"),
            "china_organization": values.get("China", {}).get("organization"),
        }
        for published_at, values in sorted(by_date.items())
    ]
    complete_points = [
        point for point in country_trend if point["usa"] is not None and point["china"] is not None
    ]
    first_gap = (
        abs(float(complete_points[0]["usa"]) - float(complete_points[0]["china"]))
        if complete_points
        else None
    )
    current_gap = (
        abs(float(complete_points[-1]["usa"]) - float(complete_points[-1]["china"]))
        if complete_points
        else None
    )
    gap_delta = (
        round(current_gap - first_gap, 2)
        if current_gap is not None and first_gap is not None
        else None
    )

    movers: list[dict[str, Any]] = []
    for (_, model_name), history in model_history.items():
        ordered = sorted(history.items())
        if len(ordered) < 2:
            continue
        first_row = ordered[0][1]
        latest_row = ordered[-1][1]
        movers.append(
            {
                "model": model_name,
                "organization": latest_row.organization,
                "region": _organization_region(latest_row.organization),
                "delta": round(float(latest_row.score - first_row.score), 2),
                "score": float(latest_row.score),
            }
        )
    movers.sort(key=lambda item: (-item["delta"], item["model"].lower()))
    movers = movers[:5]

    latest_date = max(by_date, default=None)
    provider_rows: list[dict[str, Any]] = []
    if latest_date is not None:
        best_by_provider: dict[str, LeaderboardSnapshot] = {}
        for row in rows:
            if row.published_at != latest_date:
                continue
            current = best_by_provider.get(row.organization)
            if current is None or row.score > current.score:
                best_by_provider[row.organization] = row
        provider_rows = [
            {
                "organization": row.organization,
                "model": row.model_external_id,
                "score": float(row.score),
                "region": _organization_region(row.organization),
            }
            for row in sorted(best_by_provider.values(), key=lambda item: item.score, reverse=True)[
                :8
            ]
        ]

    total_models = session.scalar(select(func.count(Model.id))) or 0
    active_provider_cutoff = datetime.now(UTC) - timedelta(days=30)
    active_providers = (
        session.scalar(
            select(func.count(func.distinct(PriceObservation.provider))).where(
                PriceObservation.observed_at >= active_provider_cutoff
            )
        )
        or 0
    )
    open_weight_models = (
        session.scalar(
            select(func.count(ModelProfile.model_id)).where(
                ModelProfile.openness.in_(["open_source", "open_weight"])
            )
        )
        or 0
    )
    open_weight_share = round((open_weight_models / total_models) * 100, 1) if total_models else 0

    current_month = today.replace(day=1)
    next_month = _next_month(current_month)
    previous_month_end = current_month
    previous_month_start = (current_month - timedelta(days=1)).replace(day=1)
    new_models = _count_models_between(session, current_month, next_month)
    previous_new_models = _count_models_between(session, previous_month_start, previous_month_end)
    new_model_delta = new_models - previous_new_models

    fastest_riser = movers[0] if movers else None
    insights: list[str] = []
    if current_gap is not None:
        if gap_delta is not None and gap_delta < 0:
            insights.append(
                "Çin ve ABD arasındaki frontier farkı seçili dönemde "
                f"{abs(gap_delta):g} puan daraldı."
            )
        elif gap_delta is not None and gap_delta > 0:
            insights.append(
                f"Çin ve ABD arasındaki frontier farkı seçili dönemde {gap_delta:g} puan açıldı."
            )
        else:
            insights.append(f"Güncel Çin–ABD frontier farkı {current_gap:.1f} puan.")
    insights.append(
        "Açık ağırlıklı modeller doğrulanmış katalog kayıtlarının "
        f"%{open_weight_share:g} payını oluşturuyor."
    )
    if fastest_riser:
        insights.append(
            f"{fastest_riser['model']} seçili dönemin en hızlı yükselen modeli: "
            f"{fastest_riser['delta']:+g} puan."
        )
    insights.append(
        f"Bu ay {new_models} yeni model yayın tarihiyle kataloğa girdi "
        f"({new_model_delta:+d} önceki aya göre)."
    )

    return {
        "generated_at": datetime.now(UTC),
        "benchmark": {
            "slug": benchmark,
            "name": definition.name if definition else benchmark_meta["label"],
            "label": benchmark_meta["label"],
            "metric": benchmark_meta["metric"],
        },
        "period_days": days,
        "published_at": latest_date,
        "summary": {
            "frontier_gap": round(current_gap, 2) if current_gap is not None else None,
            "frontier_gap_delta": gap_delta,
            "open_weight_share": open_weight_share,
            "open_weight_models": open_weight_models,
            "new_models_this_month": new_models,
            "new_models_delta": new_model_delta,
            "fastest_riser": fastest_riser,
            "total_models": total_models,
            "active_providers": active_providers,
        },
        "country_trend": country_trend,
        "providers": provider_rows,
        "movers": movers,
        "insights": insights,
        "method_note": (
            "Ülke serisi, her snapshot tarihinde ilgili ülkenin en yüksek benchmark skorunu "
            "gösterir; bileşik veya tahmini skor kullanılmaz."
        ),
    }


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
            "Türkçe/Türkiye sinyali model adı, geliştirici, HF etiketleri "
            "veya kaynak metadata'sından gelir."
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
