from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.config import get_settings
from llm_radar.database.models import (
    BenchmarkDefinition,
    ChangeEvent,
    Company,
    LeaderboardSnapshot,
    Model,
    ModelSnapshot,
    PriceObservation,
    Source,
)
from llm_radar.database.session import get_db

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]


def _translate_to_turkish(text: str | None) -> str | None:
    if not text:
        return text
    try:
        response = httpx.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "auto", "tl": "tr", "dt": "t", "q": text},
            timeout=3.0,
        )
        response.raise_for_status()
        payload = response.json()
        parts = payload[0] if isinstance(payload, list) and payload else []
        translated = "".join(
            segment[0] for segment in parts if isinstance(segment, list) and segment
        ).strip()
        return translated or text
    except Exception:
        return text


@router.get("/stats", tags=["stats"])
def stats(session: DatabaseSession) -> dict[str, int]:
    return {
        "companies": session.scalar(select(func.count()).select_from(Company)) or 0,
        "models": session.scalar(select(func.count()).select_from(Model)) or 0,
        "snapshots": session.scalar(select(func.count()).select_from(ModelSnapshot)) or 0,
        "price_observations": session.scalar(select(func.count()).select_from(PriceObservation))
        or 0,
        "change_events": session.scalar(select(func.count()).select_from(ChangeEvent)) or 0,
    }


def _leaderboard_response(
    session: DatabaseSession,
    benchmark_slug: str,
    category: str,
    limit: int,
    source_name: str,
    source_url: str,
) -> dict[str, Any]:
    benchmark = session.scalar(
        select(BenchmarkDefinition).where(BenchmarkDefinition.slug == benchmark_slug)
    )
    if benchmark is None:
        raise HTTPException(status_code=503, detail=f"{source_name} has not been collected")
    published_at = session.scalar(
        select(func.max(LeaderboardSnapshot.published_at)).where(
            LeaderboardSnapshot.benchmark_id == benchmark.id,
            LeaderboardSnapshot.category == category,
        )
    )
    rows = session.scalars(
        select(LeaderboardSnapshot)
        .where(
            LeaderboardSnapshot.benchmark_id == benchmark.id,
            LeaderboardSnapshot.category == category,
            LeaderboardSnapshot.published_at == published_at,
        )
        .order_by(LeaderboardSnapshot.rank)
        .limit(limit)
    ).all()
    return {
        "source": {
            "name": source_name,
            "url": source_url,
            "benchmark": benchmark.name,
        },
        "category": category,
        "published_at": published_at,
        "items": [
            {
                "model_name": row.model_external_id,
                "organization": row.organization,
                "license": row.license,
                "rating": float(row.score),
                "rating_lower": float(row.score_lower) if row.score_lower is not None else None,
                "rating_upper": float(row.score_upper) if row.score_upper is not None else None,
                "vote_count": row.vote_count,
                "rank": display_rank,
                "category": row.category,
                "leaderboard_publish_date": row.published_at,
                "details": row.raw_data,
            }
            for display_rank, row in enumerate(rows, start=1)
        ],
    }


@router.get("/leaderboards/arena", tags=["leaderboards"])
def arena_leaderboard(
    session: DatabaseSession,
    category: str = "overall",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return _leaderboard_response(
        session,
        benchmark_slug="arena-text",
        category=category,
        limit=limit,
        source_name="Arena",
        source_url="https://arena.ai/leaderboard/text",
    )


@router.get("/leaderboards/swe-bench", tags=["leaderboards"])
def swebench_leaderboard(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return _leaderboard_response(
        session,
        benchmark_slug="swe-bench-verified",
        category="coding_agent",
        limit=limit,
        source_name="SWE-bench",
        source_url="https://www.swebench.com/",
    )


@router.get("/leaderboards/artificial-analysis/{category}", tags=["leaderboards"])
def artificial_analysis_leaderboard(
    category: str,
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    allowed = {"intelligence", "coding", "agentic"}
    if category not in allowed:
        raise HTTPException(status_code=404, detail="Unknown Artificial Analysis category")
    return _leaderboard_response(
        session,
        benchmark_slug=f"artificial-analysis-{category}",
        category=category,
        limit=limit,
        source_name="Artificial Analysis",
        source_url="https://artificialanalysis.ai/",
    )


@router.get("/leaderboards/livebench", tags=["leaderboards"])
def livebench_leaderboard(
    session: DatabaseSession,
    category: str = "overall",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return _leaderboard_response(
        session,
        f"livebench-{category}",
        "general" if category == "overall" else category,
        limit,
        "LiveBench",
        "https://livebench.ai/",
    )


@router.get("/leaderboards/mmlu-pro", tags=["leaderboards"])
def mmlu_pro_leaderboard(
    session: DatabaseSession,
    category: str = "overall",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return _leaderboard_response(
        session,
        f"mmlu-pro-{category}",
        "knowledge" if category == "overall" else category,
        limit,
        "MMLU-Pro",
        "https://huggingface.co/spaces/TIGER-Lab/MMLU-Pro",
    )


@router.get("/benchmarks/catalog", tags=["leaderboards"])
def benchmark_catalog() -> dict[str, Any]:
    return {
        "items": [
            {
                "source": "Arena",
                "source_class": "independent_human_preference",
                "categories": ["overall"],
                "score_unit": "arena_rating",
            },
            {
                "source": "SWE-bench",
                "source_class": "academic",
                "categories": ["coding_agent"],
                "score_unit": "resolved_percent",
            },
            {
                "source": "LiveBench",
                "source_class": "academic",
                "categories": [
                    "overall",
                    "reasoning",
                    "math",
                    "coding",
                    "data_analysis",
                    "writing",
                    "instruction_following",
                    "agentic_coding",
                ],
                "score_unit": "percent",
            },
            {
                "source": "MMLU-Pro",
                "source_class": "academic",
                "categories": [
                    "overall",
                    "biology",
                    "business",
                    "chemistry",
                    "computer_science",
                    "economics",
                    "engineering",
                    "health",
                    "history",
                    "law",
                    "math",
                    "philosophy",
                    "physics",
                    "psychology",
                    "other",
                ],
                "score_unit": "accuracy_percent",
            },
            {
                "source": "Artificial Analysis",
                "source_class": "independent_measurement",
                "categories": ["intelligence", "coding", "agentic"],
                "score_unit": "source_index",
            },
            {
                "source": "LiveCodeBench",
                "source_class": "academic",
                "categories": ["code_generation"],
                "score_unit": "pass_at_1_percent",
            },
            {
                "source": "SWE-bench Live",
                "source_class": "academic",
                "categories": [
                    "lite",
                    "full",
                    "verified",
                    "ccpp",
                    "csharp",
                    "go",
                    "java",
                    "rust",
                    "tsjs",
                    "windows",
                ],
                "score_unit": "resolved_percent",
            },
            {
                "source": "τ-bench",
                "source_class": "academic",
                "categories": ["airline", "retail", "telecom", "banking_knowledge"],
                "score_unit": "pass_at_1_percent",
            },
        ],
        "policy": (
            "Scores are shown only within the benchmark protocol that produced them; "
            "no cross-benchmark composite is calculated."
        ),
    }


@router.get("/leaderboards/livecodebench", tags=["leaderboards"])
def livecodebench_leaderboard(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return _leaderboard_response(
        session,
        "livecodebench-code-generation",
        "code_generation",
        limit,
        "LiveCodeBench",
        "https://livecodebench.github.io/leaderboard.html",
    )


@router.get("/leaderboards/swe-bench-live", tags=["leaderboards"])
def swebench_live_leaderboard(
    session: DatabaseSession,
    category: str = "lite",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return _leaderboard_response(
        session,
        f"swe-bench-live-{category}",
        category,
        limit,
        "SWE-bench Live",
        "https://swe-bench-live.github.io/",
    )


@router.get("/leaderboards/tau-bench", tags=["leaderboards"])
def tau_bench_leaderboard(
    session: DatabaseSession,
    category: str = "airline",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return _leaderboard_response(
        session,
        f"tau-bench-{category}",
        category,
        limit,
        "τ-bench",
        "https://taubench.com/leaderboard",
    )


@router.get("/sources/health", tags=["sources"])
def source_health(session: DatabaseSession) -> dict[str, Any]:
    stale_after = timedelta(hours=get_settings().source_stale_after_hours)
    now = datetime.now(UTC)
    sources = session.scalars(select(Source).order_by(Source.name)).all()
    items = []
    for source in sources:
        stale = source.last_success_at is None or now - source.last_success_at > stale_after
        items.append(
            {
                "name": source.name,
                "url": source.url,
                "status": "stale" if stale and source.status == "active" else source.status,
                "last_checked_at": source.last_checked_at,
                "last_success_at": source.last_success_at,
                "has_error": source.last_error is not None,
                "consecutive_failures": source.consecutive_failures,
                "stale": stale,
            }
        )
    return {"checked_at": now, "items": items}


@router.get("/models", tags=["models"])
def list_models(
    session: DatabaseSession,
    company: str | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    filters = []
    if company:
        filters.append(Company.slug == company.lower())
    if search:
        filters.append(Model.name.ilike(f"%{search}%"))

    total = (
        session.scalar(select(func.count()).select_from(Model).join(Company).where(*filters)) or 0
    )
    latest_price_id = (
        select(PriceObservation.id)
        .where(PriceObservation.model_id == Model.id)
        .order_by(PriceObservation.observed_at.desc())
        .limit(1)
        .correlate(Model)
        .scalar_subquery()
    )
    latest_snapshot_id = (
        select(ModelSnapshot.id)
        .where(ModelSnapshot.model_id == Model.id)
        .order_by(ModelSnapshot.observed_at.desc())
        .limit(1)
        .correlate(Model)
        .scalar_subquery()
    )
    rows = session.execute(
        select(Model, Company, PriceObservation, ModelSnapshot)
        .join(Company)
        .outerjoin(PriceObservation, PriceObservation.id == latest_price_id)
        .outerjoin(ModelSnapshot, ModelSnapshot.id == latest_snapshot_id)
        .where(*filters)
    ).all()
    ranked_rows = sorted(
        rows,
        key=lambda row: (
            row[3].data.get("created", 0) if row[3] else 0,
            row[0].name.lower(),
        ),
        reverse=True,
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": str(model.id),
                "slug": model.slug,
                "name": model.name,
                "company": {"slug": company_row.slug, "name": company_row.name},
                "context_window": model.context_window,
                "capabilities": model.capabilities,
                "pricing": (
                    {
                        "input": str(price.input_price) if price.input_price is not None else None,
                        "output": (
                            str(price.output_price) if price.output_price is not None else None
                        ),
                        "cache_read": (
                            str(price.cache_read_price)
                            if price.cache_read_price is not None
                            else None
                        ),
                        "currency": price.currency,
                        "unit": price.unit,
                        "observed_at": price.observed_at,
                    }
                    if price
                    else None
                ),
            }
            for model, company_row, price, snapshot in ranked_rows[offset : offset + limit]
        ],
    }


@router.get("/models/{model_id}", tags=["models"])
def model_detail(model_id: UUID, session: DatabaseSession) -> dict[str, Any]:
    model = session.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    company = session.get(Company, model.company_id)
    snapshot = session.scalar(
        select(ModelSnapshot)
        .where(ModelSnapshot.model_id == model.id)
        .order_by(ModelSnapshot.observed_at.desc())
        .limit(1)
    )
    prices = session.scalars(
        select(PriceObservation)
        .where(PriceObservation.model_id == model.id)
        .order_by(PriceObservation.observed_at.desc())
        .limit(100)
    ).all()
    src_ids: list[Any] = [
        sid for sid in
        ([snapshot.source_id] if snapshot else [])
        + [p.source_id for p in prices]
        if sid is not None
    ]
    unique_source_ids = list(dict.fromkeys(src_ids))
    source_rows: dict[Any, Any] = {}
    if unique_source_ids:
        source_rows = {
            s.id: s
            for s in session.scalars(
                select(Source).where(Source.id.in_(unique_source_ids))
            ).all()
        }
    model_key = canonical_model_name(model.name)
    benchmarks = session.scalars(select(BenchmarkDefinition)).all()
    benchmark_scores = []
    for benchmark in benchmarks:
        published_at = session.scalar(
            select(func.max(LeaderboardSnapshot.published_at)).where(
                LeaderboardSnapshot.benchmark_id == benchmark.id
            )
        )
        candidates = session.scalars(
            select(LeaderboardSnapshot).where(
                LeaderboardSnapshot.benchmark_id == benchmark.id,
                LeaderboardSnapshot.published_at == published_at,
            )
        ).all()
        matches = [
            row for row in candidates if canonical_model_name(row.model_external_id) == model_key
        ]
        if matches:
            best = min(matches, key=lambda row: row.rank)
            benchmark_scores.append(
                {
                    "benchmark": benchmark.name,
                    "benchmark_slug": benchmark.slug,
                    "rank": best.rank,
                    "score": float(best.score),
                    "published_at": best.published_at,
                    "source_url": benchmark.methodology_url,
                }
            )
    return {
        "id": str(model.id),
        "slug": model.slug,
        "name": model.name,
        "company": {"slug": company.slug, "name": company.name} if company else None,
        "context_window": model.context_window,
        "capabilities": model.capabilities,
        "description": (
            _translate_to_turkish(snapshot.data.get("description")) if snapshot else None
        ),
        "tokenizer": snapshot.data.get("tokenizer") if snapshot else None,
        "created": snapshot.data.get("created") if snapshot else None,
        "sources": (
            [
                {
                    "name": s.name,
                    "url": s.url,
                    "reliability": getattr(s, "reliability_level", None),
                    "source_class": getattr(s, "source_class", None),
                }
                for s in source_rows.values()
            ]
            if source_rows
            else [
                {
                    "name": "OpenRouter",
                    "url": f"https://openrouter.ai/{model.slug}",
                    "reliability": "third_party",
                    "source_class": "independent",
                }
            ]
        ),
        "price_history": [
            {
                "input": str(price.input_price) if price.input_price is not None else None,
                "output": str(price.output_price) if price.output_price is not None else None,
                "cache_read": (
                    str(price.cache_read_price) if price.cache_read_price is not None else None
                ),
                "currency": price.currency,
                "unit": price.unit,
                "observed_at": price.observed_at,
            }
            for price in prices
        ],
        "benchmarks": benchmark_scores,
    }


@router.get("/events", tags=["events"])
def list_events(
    session: DatabaseSession,
    event_type: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    filters = [ChangeEvent.event_type == event_type] if event_type else []
    total = session.scalar(select(func.count()).select_from(ChangeEvent).where(*filters)) or 0
    events = session.scalars(
        select(ChangeEvent)
        .where(*filters)
        .order_by(ChangeEvent.detected_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "entity_type": event.entity_type,
                "entity_id": str(event.entity_id),
                "title": event.title,
                "old_value": event.old_value,
                "new_value": event.new_value,
                "change_percentage": (
                    str(event.change_percentage) if event.change_percentage is not None else None
                ),
                "importance": event.importance,
                "evidence": event.evidence,
                "verification_status": event.verification_status,
                "detected_at": event.detected_at,
            }
            for event in events
        ],
    }
