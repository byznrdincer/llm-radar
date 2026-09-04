import re
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from email.utils import parsedate_to_datetime
from types import SimpleNamespace
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.api.routes import (
    _leaderboard_license_index,
    _resolved_compare_openness,
    _scoped_catalog_candidates,
)
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
from llm_radar.model_selection import selection_matches

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]

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


def _resolved_row_openness(
    model_name: str,
    organization: str,
    catalog_index: dict[str, list[tuple[Model, ModelProfile | None, str]]],
) -> str | None:
    """Resolve a leaderboard row's openness the same way the catalog does.

    Matches on canonical model name, scoped to the organization the same
    ambiguity-safe way leaderboard->catalog matching already works elsewhere
    (a leaderboard's organization string, e.g. "Ai2", often doesn't equal
    the catalog Company.name, e.g. "Allenai" - matching on model name alone
    and only trusting it when the organization confirms one candidate, or
    all candidates agree, avoids both false negatives and false positives).
    Uses the same resolver as the model catalog and leaderboards (asserted
    profile value, then a license-based/curated-family fallback) so "Open
    Source" means the same thing everywhere in the app.
    """
    candidates = _scoped_catalog_candidates(model_name, organization, catalog_index)
    if len(candidates) != 1:
        return None
    model, profile, company_name = candidates[0]
    company_stub = cast(Company, SimpleNamespace(name=company_name))
    # _known_family_license's verified-model dict is keyed on the
    # leaderboard-style spelling (e.g. "Nex-N2-Pro"), which can differ from
    # the catalog's own display name (e.g. "Nex N2 Pro") enough to miss an
    # exact-match lookup. Use a stub carrying the original name/org but the
    # catalog Model's real license/is_open_weight fields (never fabricated).
    model_stub = cast(
        Model,
        SimpleNamespace(
            name=model_name, license=model.license, is_open_weight=model.is_open_weight
        ),
    )
    return _resolved_compare_openness(model_stub, company_stub, profile)


def _ranked_radar_score(
    session: Session,
    origin: Literal["all", "turkish"],
    as_of: datetime | None = None,
) -> dict[str, Any]:
    """Build the ranked, catalog-linked Radar Score list.

    as_of=None uses each benchmark's latest snapshot (today's ranking).
    Passing a past datetime instead uses each benchmark's latest snapshot
    observed at or before that time, so a past ranking can be recomputed
    with the exact same methodology and diffed against today's - e.g. to
    find what changed in the last 24 hours.
    """
    definitions = {
        definition.slug: definition
        for definition in session.scalars(
            select(BenchmarkDefinition).where(BenchmarkDefinition.slug.in_(RADAR_SCORE_BENCHMARKS))
        ).all()
    }
    catalog_index = _strict_catalog_identity_index(session)
    turkish_ids = _turkish_model_ids(session) if origin == "turkish" else None
    inputs: list[RadarScoreInput] = []
    leaders: list[dict[str, Any]] = []
    snapshot_dates: list[date] = []

    for slug, (category_group, label) in RADAR_SCORE_BENCHMARKS.items():
        definition = definitions.get(slug)
        if definition is None:
            continue
        published_at_query = select(func.max(LeaderboardSnapshot.published_at)).where(
            LeaderboardSnapshot.benchmark_id == definition.id
        )
        rows_query = select(LeaderboardSnapshot).where(
            LeaderboardSnapshot.benchmark_id == definition.id
        )
        if as_of is not None:
            published_at_query = published_at_query.where(LeaderboardSnapshot.observed_at <= as_of)
            rows_query = rows_query.where(LeaderboardSnapshot.observed_at <= as_of)
        published_at = session.scalar(published_at_query)
        if published_at is None:
            continue
        rows = session.scalars(
            rows_query.where(LeaderboardSnapshot.published_at == published_at).order_by(
                LeaderboardSnapshot.rank.asc()
            )
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
            if turkish_ids is not None and catalog_model_id not in turkish_ids:
                continue
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

    # Only models that actually appear in a relevant benchmark and resolve
    # to one specific catalog entry - not the whole catalog. Rows with no
    # catalog_model_id are benchmark entries that never resolved to a single
    # catalog model (see today's matching-safety hardening) and are dropped
    # rather than shown as an unlinked "catalog model".
    scored_items = [item for item in result["items"] if item.get("catalog_model_id")]
    for rank, item in enumerate(scored_items, start=1):
        item["rank"] = rank

    if scored_items:
        # Uses the item's own leaderboard-derived model_name/organization
        # (e.g. "Nex-N2-Pro"), not the catalog's own display name (e.g.
        # "Nex N2 Pro") - _known_family_license's verified-model dict is
        # keyed on the leaderboard-style spelling, so resolving via the
        # catalog Model's own .name here would silently miss it.
        openness_index = _leaderboard_license_index(session)
        for item in scored_items:
            item["openness"] = _resolved_row_openness(
                item["model_name"], item["organization"], openness_index
            )

    return {
        "snapshot_at": max(snapshot_dates, default=None),
        "methodology": result["methodology"],
        "ineligible_count": result["ineligible_count"],
        "active_benchmarks": result["active_benchmarks"],
        "leaders": leaders,
        "items": scored_items,
    }


@router.get("/insights/radar-score", tags=["insights"])
def radar_score(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0,
    origin: Literal["all", "turkish"] = "all",
) -> dict[str, Any]:
    """Return the versioned LLM Radar composite index and source leaders.

    origin="turkish" reuses the exact same scoring engine (same
    normalization, category weights, coverage rules) restricted to the
    catalog's Turkish-signal model subset - not a separate methodology.
    """
    built = _ranked_radar_score(session, origin)
    scored_items = built["items"]
    total = len(scored_items)
    return {
        "generated_at": datetime.now(UTC),
        "snapshot_at": built["snapshot_at"],
        "origin": origin,
        "methodology": built["methodology"],
        "eligible_count": total,
        "ineligible_count": built["ineligible_count"],
        "total": total,
        "active_benchmarks": built["active_benchmarks"],
        "leaders": built["leaders"],
        "items": scored_items[offset : offset + limit],
    }


@router.get("/insights/radar-score-changes", tags=["insights"])
def radar_score_changes(session: DatabaseSession) -> dict[str, Any]:
    """Diff today's LLM Radar Score ranking against the ranking as of 24h ago.

    This is about our own composite leaderboard specifically - which models
    newly cleared the eligibility bar, entered the top 3, or became the new
    #1 - recomputed with the exact same methodology at both points in time,
    not a generic feed of unrelated source events.
    """
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=24)
    current = _ranked_radar_score(session, "all")
    previous = _ranked_radar_score(session, "all", as_of=cutoff)
    previous_by_id = {item["catalog_model_id"]: item for item in previous["items"]}

    events: list[dict[str, Any]] = []
    for item in current["items"]:
        model_id = item["catalog_model_id"]
        prior = previous_by_id.get(model_id)
        prior_rank = prior["rank"] if prior is not None else None
        if item["rank"] == 1 and prior_rank != 1:
            kind = "new_leader"
            title = f"{item['model_name']} LLM Radar Skoru'nda yeni lider oldu"
        elif item["rank"] <= 3 and (prior_rank is None or prior_rank > 3):
            kind = "entered_top3"
            title = (
                f"{item['model_name']} LLM Radar Skoru'nda Top 3'e girdi "
                f"(#{prior_rank} → #{item['rank']})"
                if prior_rank is not None
                else f"{item['model_name']} doğrudan LLM Radar Skoru Top 3'üne girdi"
            )
        elif prior is None:
            kind = "new_entry"
            title = f"{item['model_name']} LLM Radar Skoru'na girdi (#{item['rank']})"
        else:
            continue
        events.append(
            {
                "kind": kind,
                "catalog_model_id": model_id,
                "model_name": item["model_name"],
                "organization": item["organization"],
                "rank": item["rank"],
                "previous_rank": prior_rank,
                "score": item["score"],
                "title": title,
            }
        )

    rank_priority = {"new_leader": 0, "entered_top3": 1, "new_entry": 2}
    events.sort(
        key=lambda event: (
            rank_priority[cast(str, event["kind"])],
            cast(int, event["rank"]),
        )
    )

    counts = {
        "new_leader": sum(1 for event in events if event["kind"] == "new_leader"),
        "entered_top3": sum(1 for event in events if event["kind"] == "entered_top3"),
        "new_entry": sum(1 for event in events if event["kind"] == "new_entry"),
    }
    return {
        "generated_at": now,
        "window_hours": 24,
        "compared_snapshot_at": previous["snapshot_at"],
        "current_snapshot_at": current["snapshot_at"],
        "counts": counts,
        "total": len(events),
        "items": events,
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
        if after is None:
            return None
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
        return (
            _resolved_row_openness(model_external_id, organization, catalog_index) == openness
        )

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


def _turkish_catalog_rows(
    session: Session,
) -> list[tuple[Model, Company, ModelProfile | None, ModelSnapshot | None]]:
    """Catalog rows (with latest snapshot) that match the Turkish signal set."""
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
    return [
        (model, company, profile, snapshot)
        for model, company, profile, snapshot in rows
        if _is_turkish_model(model, company, profile, snapshot)
    ]


def _turkish_model_ids(session: Session) -> set[str]:
    return {str(model.id) for model, _, _, _ in _turkish_catalog_rows(session)}


def list_turkish_models(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    benchmark_index = selection_matches(session, "general")
    candidates: list[tuple[Model, Company, ModelProfile | None, ModelSnapshot | None, int]] = []
    for model, company, profile, snapshot in _turkish_catalog_rows(session):
        downloads_raw = snapshot.data.get("downloads") if snapshot else None
        downloads = downloads_raw if isinstance(downloads_raw, int) else 0
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
