"""Leaderboard and benchmark-catalog endpoints."""

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from llm_radar.api.deps import DatabaseSession
from llm_radar.catalog_resolution import (
    _leaderboard_license_index,
    _resolve_catalog_model,
    _resolve_leaderboard_license,
)
from llm_radar.database.models import (
    BenchmarkDefinition,
    LeaderboardSnapshot,
)

router = APIRouter(prefix="/api/v1")


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
    catalog_index = _leaderboard_license_index(session)
    items = []
    for display_rank, row in enumerate(rows, start=1):
        license_name, license_method = _resolve_leaderboard_license(
            raw_license=row.license,
            model_name=row.model_external_id,
            organization=row.organization,
            catalog_index=catalog_index,
        )
        catalog_model = _resolve_catalog_model(
            session,
            row.model_external_id,
            row.organization,
            catalog_index,
        )
        details = dict(row.raw_data or {})
        details["license_resolution"] = {
            "method": license_method,
            "raw_license": row.license,
        }
        items.append(
            {
                "model_name": row.model_external_id,
                "organization": row.organization,
                "license": license_name,
                "rating": float(row.score),
                "rating_lower": (float(row.score_lower) if row.score_lower is not None else None),
                "rating_upper": (float(row.score_upper) if row.score_upper is not None else None),
                "vote_count": row.vote_count,
                "rank": display_rank,
                "category": row.category,
                "leaderboard_publish_date": row.published_at,
                "catalog_model_id": str(catalog_model.id) if catalog_model is not None else None,
                "openness": (
                    catalog_model.profile.openness
                    if catalog_model is not None and catalog_model.profile is not None
                    else None
                ),
                "details": details,
            }
        )
    return {
        "source": {
            "name": source_name,
            "url": source_url,
            "benchmark": benchmark.name,
        },
        "category": category,
        "published_at": published_at,
        "items": items,
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
