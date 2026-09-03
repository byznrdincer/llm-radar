import re
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.composite import (
    RADAR_SCORE_BENCHMARKS,
    RadarScoreInput,
    build_radar_scores,
    canonical_model_name,
)
from llm_radar.database.models import (
    BenchmarkDefinition,
    ChangeEvent,
    Company,
    LeaderboardSnapshot,
    Model,
    ModelProfile,
    ModelSnapshot,
    PriceObservation,
    Source,
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

RADAR_EVENT_TYPES = {
    "model.released",
    "leaderboard.changed",
    "price.changed",
    "cache_price.changed",
    "capability.changed",
    "context.changed",
    "api.updated",
    "company.announcement",
    "product.launched",
    "github.release_published",
}
PUBLISHED_EVENT_TYPES = {
    "model.released",
    "api.updated",
    "company.announcement",
    "product.launched",
    "github.release_published",
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
    if any(name in normalized for name in EUROPE_ORGANIZATIONS):
        return "Europe"
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


def _strict_catalog_identity_index(
    session: Session,
) -> dict[tuple[str, str], str]:
    """Resolve only unique organization + normalized-name catalog matches."""
    candidates: dict[tuple[str, str], list[str]] = defaultdict(list)
    rows = session.execute(select(Model, Company).join(Company, Company.id == Model.company_id))
    for model, company in rows:
        key = (canonical_model_name(company.name), canonical_model_name(model.name))
        if all(key):
            candidates[key].append(str(model.id))
    return {key: model_ids[0] for key, model_ids in candidates.items() if len(model_ids) == 1}


def _catalog_openness_index(session: Session) -> dict[tuple[str, str], str | None]:
    """Resolve (organization, model) leaderboard identities to catalog openness.

    Best-effort match on the same canonical name pair used elsewhere; entries
    with no catalog match or no profile are simply absent (never guessed).
    """
    index: dict[tuple[str, str], str | None] = {}
    rows = session.execute(
        select(Company, Model, ModelProfile)
        .join(Model, Model.company_id == Company.id)
        .outerjoin(ModelProfile, ModelProfile.model_id == Model.id)
    )
    for company, model, profile in rows:
        key = (canonical_model_name(company.name), canonical_model_name(model.name))
        if all(key):
            index[key] = profile.openness if profile else None
    return index


@router.get("/insights/radar-score", tags=["insights"])
def radar_score(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> dict[str, Any]:
    """Return the versioned LLM Radar composite index and source leaders."""
    definitions = {
        definition.slug: definition
        for definition in session.scalars(
            select(BenchmarkDefinition).where(BenchmarkDefinition.slug.in_(RADAR_SCORE_BENCHMARKS))
        ).all()
    }
    catalog_index = _strict_catalog_identity_index(session)
    inputs: list[RadarScoreInput] = []
    leaders: list[dict[str, Any]] = []
    snapshot_dates: list[date] = []

    for slug, (category_group, label) in RADAR_SCORE_BENCHMARKS.items():
        definition = definitions.get(slug)
        if definition is None:
            continue
        published_at = session.scalar(
            select(func.max(LeaderboardSnapshot.published_at)).where(
                LeaderboardSnapshot.benchmark_id == definition.id
            )
        )
        if published_at is None:
            continue
        rows = session.scalars(
            select(LeaderboardSnapshot)
            .where(
                LeaderboardSnapshot.benchmark_id == definition.id,
                LeaderboardSnapshot.published_at == published_at,
            )
            .order_by(LeaderboardSnapshot.rank.asc())
        ).all()
        if not rows:
            continue
        field_size = max(len(rows), max(row.rank for row in rows))
        snapshot_dates.append(published_at)
        leader = rows[0]
        leaders.append(
            {
                "benchmark": slug,
                "label": label,
                "category": category_group,
                "model_name": leader.model_external_id,
                "organization": leader.organization,
                "rank": leader.rank,
                "score": float(leader.score),
                "published_at": leader.published_at,
                "methodology_url": definition.methodology_url,
            }
        )
        for row in rows:
            identity_tuple = (
                canonical_model_name(row.organization),
                canonical_model_name(row.model_external_id),
            )
            catalog_model_id = catalog_index.get(identity_tuple)
            identity_key = (
                f"catalog:{catalog_model_id}"
                if catalog_model_id
                else f"benchmark:{identity_tuple[0]}::{identity_tuple[1]}"
            )
            inputs.append(
                RadarScoreInput(
                    benchmark=slug,
                    model_name=row.model_external_id,
                    organization=row.organization,
                    rank=row.rank,
                    field_size=field_size,
                    published_at=row.published_at,
                    identity_key=identity_key,
                    catalog_model_id=catalog_model_id,
                )
            )

    result = build_radar_scores(inputs)
    return {
        "generated_at": datetime.now(UTC),
        "snapshot_at": max(snapshot_dates, default=None),
        "methodology": result["methodology"],
        "eligible_count": result["eligible_count"],
        "ineligible_count": result["ineligible_count"],
        "active_benchmarks": result["active_benchmarks"],
        "leaders": leaders,
        "items": result["items"][:limit],
    }


def _coerce_event_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _event_effective_at(event: ChangeEvent) -> datetime:
    values = event.new_value if isinstance(event.new_value, dict) else {}
    if event.event_type in PUBLISHED_EVENT_TYPES:
        for field in ("published_at", "created_at", "last_modified", "release_date"):
            published_at = _coerce_event_datetime(values.get(field))
            if published_at is not None:
                return published_at
        title_date = re.search(
            r"\b(January|February|March|April|May|June|July|August|September|"
            r"October|November|December)\s+(\d{1,2}),\s+(\d{4})",
            event.title,
        )
        if title_date:
            return datetime.strptime(title_date.group(0), "%B %d, %Y").replace(tzinfo=UTC)
    detected_at = event.detected_at
    if detected_at.tzinfo is None:
        detected_at = detected_at.replace(tzinfo=UTC)
    return detected_at.astimezone(UTC)


def _event_source_url(event: ChangeEvent, source: Source | None) -> str | None:
    evidence = event.evidence if isinstance(event.evidence, dict) else {}
    values = event.new_value if isinstance(event.new_value, dict) else {}
    for value in (evidence.get("source_url"), values.get("url"), source.url if source else None):
        if isinstance(value, str) and value.startswith(("https://", "http://")):
            return value
    return None


def _radar_event_kind(event: ChangeEvent) -> str | None:
    if event.event_type == "model.released":
        return "model_release"
    if event.event_type == "leaderboard.changed":
        before = next(iter((event.old_value or {}).values()), None)
        after = next(iter((event.new_value or {}).values()), None)
        try:
            before_rank = int(before) if before is not None else None
            after_rank = int(after)
        except (TypeError, ValueError):
            return None
        if after_rank == 1 and before_rank != 1:
            return "benchmark_leader"
        if after_rank <= 3 and (before_rank is None or before_rank > 3):
            return "benchmark_top3"
        return None
    if event.event_type in {"price.changed", "cache_price.changed"}:
        return "price_change"
    if event.event_type in {"capability.changed", "context.changed"}:
        return "capability_change"
    if event.event_type in {
        "api.updated",
        "company.announcement",
        "product.launched",
        "github.release_published",
    }:
        if len(event.title.strip()) < 8:
            return None
        return "provider_update"
    return None


@router.get("/insights/radar-24h", tags=["insights"])
def radar_24h(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> dict[str, Any]:
    """Summarize source-backed events whose effective time is within 24 hours."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=24)
    rows = session.execute(
        select(ChangeEvent, Source)
        .outerjoin(Source, Source.id == ChangeEvent.source_id)
        .where(
            ChangeEvent.detected_at >= cutoff,
            ChangeEvent.event_type.in_(RADAR_EVENT_TYPES),
        )
        .order_by(ChangeEvent.importance_score.desc(), ChangeEvent.detected_at.desc())
        .limit(10000)
    ).all()
    items: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str | None]] = set()
    counts: dict[str, int] = {
        "model_release": 0,
        "benchmark_leader": 0,
        "benchmark_top3": 0,
        "price_change": 0,
        "capability_change": 0,
        "provider_update": 0,
    }
    for event, source in rows:
        effective_at = _event_effective_at(event)
        if effective_at < cutoff or effective_at > now + timedelta(minutes=5):
            continue
        kind = _radar_event_kind(event)
        if kind is None:
            continue
        source_url = _event_source_url(event, source)
        dedup_key = (kind, event.title.strip().lower(), source_url)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        counts[kind] += 1
        items.append(
            {
                "id": str(event.id),
                "kind": kind,
                "event_type": event.event_type,
                "title": event.title,
                "description": event.description,
                "importance": event.importance,
                "importance_score": event.importance_score,
                "effective_at": effective_at,
                "detected_at": event.detected_at,
                "source": source.name if source else (event.evidence or {}).get("source"),
                "source_url": source_url,
                "verification_status": event.verification_status,
            }
        )

    kind_priority = {
        "model_release": 5,
        "benchmark_leader": 4,
        "benchmark_top3": 4,
        "price_change": 3,
        "capability_change": 2,
        "provider_update": 1,
    }
    items.sort(
        key=lambda item: (
            -kind_priority[item["kind"]],
            -item["importance_score"],
            -item["effective_at"].timestamp(),
        )
    )
    featured: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    for kind in kind_priority:
        match = next((item for item in items if item["kind"] == kind), None)
        if match is not None and len(featured) < limit:
            featured.append(match)
            selected_ids.add(match["id"])
    for item in items:
        if len(featured) >= limit:
            break
        if item["id"] not in selected_ids:
            featured.append(item)
            selected_ids.add(item["id"])
    return {
        "generated_at": now,
        "window": {"hours": 24, "from": cutoff, "to": now},
        "basis": "source_backed_change_events",
        "counts": counts,
        "total": len(items),
        "items": featured,
    }


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

    # Frontier yarışı:
    # Her tarihte yalnızca o günün liderini göstermek yerine,
    # tarih boyunca o ana kadar gözlenen en yüksek skoru taşırız.
    # Yeni bir model rekor kırdığında *_changed=True olur.
    frontier_state: dict[str, dict[str, Any] | None] = {
        "USA": None,
        "China": None,
    }

    country_trend: list[dict[str, Any]] = []

    for published_at, values in sorted(by_date.items()):
        point: dict[str, Any] = {"date": published_at}

        for region, prefix in (("USA", "usa"), ("China", "china")):
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

    openness_index = _catalog_openness_index(session)
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
                "openness": openness_index.get(
                    (canonical_model_name(latest_row.organization), canonical_model_name(model_name))
                ),
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
                "openness": openness_index.get(
                    (canonical_model_name(row.organization), canonical_model_name(row.model_external_id))
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

    items: list[dict[str, Any]] = []

    for definition in definitions:
        organizations = session.scalars(
            select(LeaderboardSnapshot.organization)
            .where(LeaderboardSnapshot.benchmark_id == definition.id)
            .distinct()
        ).all()

        regions = {
            _organization_region(organization) for organization in organizations if organization
        }

        if not {"USA", "China"}.issubset(regions):
            continue

        snapshot_count = (
            session.scalar(
                select(func.count(LeaderboardSnapshot.id)).where(
                    LeaderboardSnapshot.benchmark_id == definition.id
                )
            )
            or 0
        )

        date_count = (
            session.scalar(
                select(func.count(func.distinct(LeaderboardSnapshot.published_at))).where(
                    LeaderboardSnapshot.benchmark_id == definition.id
                )
            )
            or 0
        )

        if date_count < 2:
            continue

        latest_date = session.scalar(
            select(func.max(LeaderboardSnapshot.published_at)).where(
                LeaderboardSnapshot.benchmark_id == definition.id
            )
        )

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


def _turkish_model_tags(
    model: Model,
    profile: ModelProfile | None,
    snapshot: ModelSnapshot | None,
) -> list[str]:
    tags = ["TR"]
    openness = profile.openness if profile else None
    snapshot_data = snapshot.data if snapshot and isinstance(snapshot.data, dict) else {}
    is_open_weight = snapshot_data.get("is_open_weight") is True
    if openness in {"open_weight", "open_source"} or is_open_weight:
        tags.append("Open Weight")
    haystack = " ".join(
        [
            model.name,
            model.slug,
            str(snapshot_data.get("tasks") or ""),
            str(snapshot_data.get("tags") or ""),
            " ".join(snapshot_data.get("open_weight_evidence", {}).get("files", []))
            if isinstance(snapshot_data.get("open_weight_evidence"), dict)
            else "",
        ]
    ).lower()
    if "gguf" in haystack:
        tags.append("GGUF")
    if "4bit" in haystack or "4-bit" in haystack:
        tags.append("4bit")
    return tags


def list_turkish_models(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    latest_snapshot = (
        select(
            ModelSnapshot.model_id.label("model_id"),
            func.max(ModelSnapshot.observed_at).label("max_observed"),
        )
        .group_by(ModelSnapshot.model_id)
        .subquery()
    )
    rows = session.execute(
        select(Model, Company, ModelProfile, ModelSnapshot)
        .join(Company, Company.id == Model.company_id)
        .outerjoin(ModelProfile, ModelProfile.model_id == Model.id)
        .outerjoin(latest_snapshot, latest_snapshot.c.model_id == Model.id)
        .outerjoin(
            ModelSnapshot,
            (ModelSnapshot.model_id == latest_snapshot.c.model_id)
            & (ModelSnapshot.observed_at == latest_snapshot.c.max_observed),
        )
    ).all()
    benchmark_index = benchmark_matches(session, "general")
    candidates: list[tuple[Model, Company, ModelProfile | None, ModelSnapshot | None, int]] = []
    for model, company, profile, snapshot in rows:
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
                "openness": profile.openness if profile else None,
                "tags": _turkish_model_tags(model, profile, snapshot),
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
                "source_url": (
                    (snapshot.data.get("url") or snapshot.data.get("repository"))
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
