"""LLM Radar composite-score and 24h-summary endpoints."""

import re
import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from llm_radar.api.deps import DatabaseSession
from llm_radar.api.insights_turkish import _turkish_model_ids
from llm_radar.catalog_resolution import _leaderboard_license_index, _resolved_row_openness
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
    Source,
)

router = APIRouter(prefix="/api/v1")


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

_StrictIdentityIndex = dict[tuple[str, str], str]
_STRICT_IDENTITY_TTL_SECONDS = 300.0
_strict_identity_cache: tuple[float, _StrictIdentityIndex] | None = None


def _strict_catalog_identity_index(session: Session) -> _StrictIdentityIndex:
    """Resolve only unique organization + normalized-name catalog matches.

    Column-only and cached: radar-24h builds this twice per request and the
    catalog only shifts on the multi-hour collector cadence."""
    global _strict_identity_cache
    now = time.time()
    cached = _strict_identity_cache
    if cached is not None and now - cached[0] < _STRICT_IDENTITY_TTL_SECONDS:
        return cached[1]

    candidates: dict[tuple[str, str], list[str]] = defaultdict(list)
    rows = session.execute(
        select(Model.id, Model.name, Company.name).join(Company, Company.id == Model.company_id)
    )
    for model_id, model_name, company_name in rows:
        key = (canonical_model_name(company_name), canonical_model_name(model_name))
        if all(key):
            candidates[key].append(str(model_id))
    index = {key: model_ids[0] for key, model_ids in candidates.items() if len(model_ids) == 1}
    _strict_identity_cache = (now, index)
    return index


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

    # Fetch every benchmark's latest published leaderboard in two queries rather
    # than two per benchmark definition: one to pick each benchmark's newest
    # published_at, one to pull that snapshot's rows.
    definition_ids = [definition.id for definition in definitions.values()]
    latest_published_query = select(
        LeaderboardSnapshot.benchmark_id.label("benchmark_id"),
        func.max(LeaderboardSnapshot.published_at).label("published_at"),
    ).where(LeaderboardSnapshot.benchmark_id.in_(definition_ids))
    rows_query = select(LeaderboardSnapshot)
    if as_of is not None:
        latest_published_query = latest_published_query.where(
            LeaderboardSnapshot.observed_at <= as_of
        )
        rows_query = rows_query.where(LeaderboardSnapshot.observed_at <= as_of)
    latest_published = latest_published_query.group_by(LeaderboardSnapshot.benchmark_id).subquery()
    rows_by_benchmark: dict[UUID, list[LeaderboardSnapshot]] = {}
    for row in session.scalars(
        rows_query.join(
            latest_published,
            and_(
                LeaderboardSnapshot.benchmark_id == latest_published.c.benchmark_id,
                LeaderboardSnapshot.published_at == latest_published.c.published_at,
            ),
        ).order_by(LeaderboardSnapshot.rank.asc())
    ):
        rows_by_benchmark.setdefault(row.benchmark_id, []).append(row)

    for slug, (category_group, label) in RADAR_SCORE_BENCHMARKS.items():
        definition = definitions.get(slug)
        if definition is None:
            continue
        rows = rows_by_benchmark.get(definition.id, [])
        if not rows:
            continue
        published_at = rows[0].published_at
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
