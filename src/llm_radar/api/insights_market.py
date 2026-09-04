"""Market dashboard, frontier-race and openness-trend endpoints."""

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.api.deps import DatabaseSession
from llm_radar.catalog_resolution import _leaderboard_license_index, _resolved_row_openness
from llm_radar.database.models import (
    BenchmarkDefinition,
    LeaderboardSnapshot,
    Model,
    ModelProfile,
    PriceObservation,
)

router = APIRouter(prefix="/api/v1")


USA_ORGANIZATIONS = {
    "ai2",
    "allen institute for ai",
    "allenai",
    "amazon",
    "anthropic",
    "google",
    "ibm",
    "meta",
    "microsoft",
    "nvidia",
    "openai",
    "xai",
}
CHINA_ORGANIZATIONS = {
    "alibaba",
    "ant-group",
    "ant group",
    "baidu",
    "bytedance",
    "deepseek",
    "internlm",
    "meituan",
    "minimax",
    "moonshot",
    "qwen",
    "tencent",
    "xiaomi",
    "z.ai",
    "zai",
    "zhipu",
    "zhipu ai",
}
# Katalogda takip edilen, merkezi Avrupa'da olan saglayicilar. USA/China
# listeleriyle ayni yontem: dogrulanabilir sirket->ulke eslesmesi, tahmini
# bolge/pazar payi degil.
EUROPE_ORGANIZATIONS = {
    "mistral",
    "mistral ai",
    "aleph alpha",
    "stability ai",
    "stabilityai",
}
# Ayni dogrulanabilir yontem: merkezi Kanada'da olan saglayici.
CANADA_ORGANIZATIONS = {
    "cohere",
}

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


def _organization_region(value: str) -> str | None:
    normalized = value.strip().lower()
    if any(name in normalized for name in USA_ORGANIZATIONS):
        return "USA"
    if any(name in normalized for name in CHINA_ORGANIZATIONS):
        return "China"
    if any(name in normalized for name in EUROPE_ORGANIZATIONS):
        return "Europe"
    if any(name in normalized for name in CANADA_ORGANIZATIONS):
        return "Canada"
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
    openness: Literal["open_source", "open_weight", "proprietary"] | None = None,
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
    catalog_index = _leaderboard_license_index(session)

    def _passes_openness(model_external_id: str, organization: str) -> bool:
        if openness is None:
            return True
        return _resolved_row_openness(model_external_id, organization, catalog_index) == openness

    # This dashboard only needs, per publication, the top model per organisation
    # (frontier race + provider board) plus each model's first/last score in the
    # window (movers). Loading the full arena-text history as ORM rows was ~50k
    # object builds; these are column-only queries with DISTINCT ON reductions.
    LS = LeaderboardSnapshot
    base_where: tuple[Any, ...] = ()
    if definition is not None:
        base_where = (LS.benchmark_id == definition.id, LS.published_at >= cutoff)

    frontier_rows: list[Any] = []
    first_rows: dict[tuple[str, str], Any] = {}
    last_rows: dict[tuple[str, str], Any] = {}
    if base_where:
        cols = (LS.published_at, LS.organization, LS.model_external_id, LS.score)
        frontier_query = select(*cols).where(*base_where)
        if openness is None:
            # one row per (date, org): that org's best model that day
            frontier_query = frontier_query.distinct(LS.published_at, LS.organization).order_by(
                LS.published_at, LS.organization, LS.score.desc()
            )
        else:
            frontier_query = frontier_query.order_by(LS.published_at, LS.score.desc())
        frontier_rows = [
            row
            for row in session.execute(frontier_query).all()
            if _passes_openness(row.model_external_id, row.organization)
        ]

        for direction, target in (
            (LS.published_at.asc(), first_rows),
            (LS.published_at.desc(), last_rows),
        ):
            edge = session.execute(
                select(*cols)
                .where(*base_where)
                .distinct(LS.organization, LS.model_external_id)
                .order_by(LS.organization, LS.model_external_id, direction)
            ).all()
            for row in edge:
                if _passes_openness(row.model_external_id, row.organization):
                    target[(row.organization, row.model_external_id)] = row

    by_date: dict[date, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in frontier_rows:
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

    # Frontier yarışı:
    # Her tarihte yalnızca o günün liderini göstermek yerine,
    # tarih boyunca o ana kadar gözlenen en yüksek skoru taşırız.
    # Yeni bir model rekor kırdığında *_changed=True olur.
    frontier_state: dict[str, dict[str, Any] | None] = {
        "USA": None,
        "China": None,
        "Europe": None,
        "Canada": None,
    }
    frontier_regions = (
        ("USA", "usa"),
        ("China", "china"),
        ("Europe", "europe"),
        ("Canada", "canada"),
    )

    country_trend: list[dict[str, Any]] = []

    for published_at, values in sorted(by_date.items()):
        point: dict[str, Any] = {"date": published_at}

        for region, prefix in frontier_regions:
            candidate = values.get(region)
            current = frontier_state[region]
            changed = False

            if candidate is not None and (current is None or candidate["score"] > current["score"]):
                frontier_state[region] = dict(candidate)
                current = frontier_state[region]
                changed = True

            point[prefix] = current["score"] if current else None
            point[f"{prefix}_model"] = current["model"] if current else None
            point[f"{prefix}_organization"] = current["organization"] if current else None
            point[f"{prefix}_changed"] = changed

        country_trend.append(point)

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
    for key, first_row in first_rows.items():
        latest_row = last_rows.get(key)
        if latest_row is None or latest_row.published_at == first_row.published_at:
            continue
        organization, model_name = key
        movers.append(
            {
                "model": model_name,
                "organization": organization,
                "region": _organization_region(organization),
                "openness": _resolved_row_openness(model_name, organization, catalog_index),
                "delta": round(float(latest_row.score - first_row.score), 2),
                "score": float(latest_row.score),
            }
        )
    movers.sort(key=lambda item: (-item["delta"], item["model"].lower()))
    movers = movers[:5]

    latest_date = max(by_date, default=None)
    provider_rows: list[dict[str, Any]] = []
    if latest_date is not None:
        best_by_provider: dict[str, Any] = {}
        for row in frontier_rows:
            if row.published_at != latest_date:
                continue
            best = best_by_provider.get(row.organization)
            if best is None or row.score > best.score:
                best_by_provider[row.organization] = row
        provider_rows = [
            {
                "organization": row.organization,
                "model": row.model_external_id,
                "score": float(row.score),
                "region": _organization_region(row.organization),
                "openness": _resolved_row_openness(
                    row.model_external_id, row.organization, catalog_index
                ),
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
            "Ülke serisi, seçili benchmarkta tarih boyunca o ana kadar gözlenen en yüksek "
            "skoru taşır. Çizgideki sıçramalar yeni bir frontier liderini gösterir; "
            "bileşik veya tahmini skor kullanılmaz."
        ),
    }


@router.get("/insights/frontier-benchmarks", tags=["insights"])
def frontier_benchmarks(
    session: DatabaseSession,
) -> dict[str, Any]:
    """ABD ve Çin verisi birlikte bulunan benchmarkları döndürür."""

    definitions = session.scalars(
        select(BenchmarkDefinition).order_by(BenchmarkDefinition.name.asc())
    ).all()

    # Two grouped queries instead of four per benchmark definition: the distinct
    # organizations behind each benchmark, and each benchmark's snapshot / date
    # counts and latest published date.
    regions_by_benchmark: dict[UUID, set[str | None]] = {}
    for benchmark_id, organization in session.execute(
        select(LeaderboardSnapshot.benchmark_id, LeaderboardSnapshot.organization).distinct()
    ):
        if organization:
            regions_by_benchmark.setdefault(benchmark_id, set()).add(
                _organization_region(organization)
            )

    stats_by_benchmark: dict[UUID, tuple[int, int, date | None]] = {
        benchmark_id: (snapshot_count, date_count, latest_date)
        for benchmark_id, snapshot_count, date_count, latest_date in session.execute(
            select(
                LeaderboardSnapshot.benchmark_id,
                func.count(LeaderboardSnapshot.id),
                func.count(func.distinct(LeaderboardSnapshot.published_at)),
                func.max(LeaderboardSnapshot.published_at),
            ).group_by(LeaderboardSnapshot.benchmark_id)
        )
    }

    items: list[dict[str, Any]] = []

    for definition in definitions:
        regions = regions_by_benchmark.get(definition.id, set())

        if not {"USA", "China"}.issubset(regions):
            continue

        snapshot_count, date_count, latest_date = stats_by_benchmark.get(
            definition.id, (0, 0, None)
        )

        if date_count < 2:
            continue

        items.append(
            {
                "slug": definition.slug,
                "name": definition.name or definition.slug,
                "snapshot_count": snapshot_count,
                "date_count": date_count,
                "latest_date": latest_date,
            }
        )

    items.sort(
        key=lambda item: (
            item["slug"] != "arena-text",
            item["name"].lower(),
        )
    )

    return {"items": items}


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
