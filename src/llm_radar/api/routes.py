import re
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from llm_radar.catalog_resolution import (
    _leaderboard_license_index,
    _resolve_catalog_model,
    _resolve_leaderboard_license,
)
from llm_radar.company_domains import company_website_url
from llm_radar.composite import canonical_model_name
from llm_radar.config import get_settings, source_is_configured
from llm_radar.database.models import (
    BenchmarkDefinition,
    ChangeEvent,
    Company,
    LeaderboardSnapshot,
    Model,
    ModelFocusScore,
    ModelProfile,
    ModelSnapshot,
    PriceObservation,
    Source,
)
from llm_radar.database.session import get_db
from llm_radar.event_intelligence import EVENT_CATEGORIES
from llm_radar.model_selection import (
    ADVANCEDNESS_TIERS,
    BENCHMARK_FOCUSES,
    advancedness_tier_for_score,
    selection_matches,
)
from llm_radar.openness import (
    _UNKNOWN_LICENSES,
    _resolved_availability,
    _resolved_compare_license,
    _resolved_compare_openness,
)

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]


class ModelSelectionRequest(BaseModel):
    use_case: Literal["general", "coding", "reasoning", "agent", "multimodal"] = "general"
    search: str | None = Field(default=None, min_length=1, max_length=200)
    developers: list[str] = Field(default_factory=list)
    providers: list[str] = Field(default_factory=list)
    families: list[str] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    required_modalities: list[Literal["text", "image", "audio", "video"]] = Field(
        default_factory=list
    )
    min_context: int | None = Field(default=None, ge=1)
    max_input_price: Decimal | None = Field(default=None, ge=0)
    max_output_price: Decimal | None = Field(default=None, ge=0)
    requires_tool_calling: bool | None = None
    requires_reasoning: bool | None = None
    availability: Literal["open_source", "open_weight", "proprietary", "unknown"] | None = None
    openness: list[Literal["open_source", "open_weight", "proprietary", "unknown"]] = Field(
        default_factory=list
    )
    licenses: list[str] = Field(default_factory=list)
    commercial_use_statuses: list[Literal["allowed", "restricted", "not_allowed", "unknown"]] = (
        Field(default_factory=list)
    )
    commercial_use: bool | None = None
    limit: int = Field(default=10, ge=1, le=50)


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


def _resolved_company_website(company: Company) -> str | None:
    return company.website_url or company_website_url(company.slug)


def _license_category(value: str | None) -> str:
    normalized = (value or "").strip().lower().replace("_", "-")
    if not normalized or normalized in _UNKNOWN_LICENSES:
        return "unknown"
    if normalized == "mit" or "mit license" in normalized:
        return "mit"
    if "apache" in normalized:
        return "apache_2_0"
    if "llama" in normalized:
        return "llama_community"
    if any(token in normalized for token in ("model-specific", "custom", "research")):
        return "model_specific"
    return "other"


def _search_term_variants(term: str) -> list[str]:
    normalized = " ".join(term.strip().split())
    if not normalized:
        return []
    variants = [normalized]
    compact = re.sub(r"[\s_.-]+", "", normalized)
    if compact and compact.lower() != normalized.lower():
        variants.append(compact)
    for separator in ("-", "_"):
        spaced = normalized.replace(" ", separator)
        if spaced not in variants:
            variants.append(spaced)
    return variants


def _model_field_search(pattern: str) -> Any:
    like_pattern = f"%{pattern}%"
    return or_(
        Model.name.ilike(like_pattern),
        Model.slug.ilike(like_pattern),
        Model.family.ilike(like_pattern),
        Company.name.ilike(like_pattern),
        Company.slug.ilike(like_pattern),
    )


def _model_search_filter(search: str) -> Any | None:
    term = " ".join(search.strip().split())
    if not term:
        return None
    clauses = [_model_field_search(variant) for variant in _search_term_variants(term)]
    tokens = term.split()
    if len(tokens) > 1:
        clauses.append(and_(*[_model_field_search(token) for token in tokens]))
    return or_(*clauses)


SORT_FIELD_PATTERN = (
    "^(name|provider|input_price|output_price|context|release_date|"
    "benchmark_score|parameter_count|active_parameter_count|backend|updated_at|best_match)$"
)


def _normalize_sort_specs(
    sort_by: Sequence[str] | None,
    sort_order: Sequence[str] | None,
) -> list[tuple[str, str]]:
    fields = [field for field in (sort_by or ["name"]) if field]
    if not fields:
        fields = ["name"]
    orders = [order for order in (sort_order or []) if order in {"asc", "desc"}]
    default_order = orders[0] if orders else "asc"
    specs: list[tuple[str, str]] = []
    for index, field in enumerate(fields):
        order = orders[index] if index < len(orders) else default_order
        specs.append((field, order))
    return specs


def _build_sql_order_by(
    sort_specs: list[tuple[str, str]], sort_columns: dict[str, Any]
) -> list[Any]:
    ordering: list[Any] = []
    for field, order in sort_specs:
        if field in {"benchmark_score", "best_match"}:
            continue
        column = sort_columns.get(field, Model.name)
        ordering.append(column.asc().nullslast() if order == "asc" else column.desc().nullslast())
    if not ordering:
        ordering.append(Model.name.asc().nullslast())
    if not any(field == "name" for field, _ in sort_specs):
        ordering.append(Model.name.asc())
    ordering.append(Model.id.asc())
    return ordering


def _capability_filter_clause(item: str) -> Any:
    normalized_capability = item.lower().replace("-", "_").strip()
    if normalized_capability in {"tool_calling", "function_calling"}:
        return ModelProfile.supports_tool_calling.is_(True)
    if normalized_capability == "reasoning":
        return ModelProfile.supports_reasoning.is_(True)
    if normalized_capability == "vision":
        return ModelProfile.modalities.contains(["image"])
    if normalized_capability == "multimodal":
        return func.jsonb_array_length(ModelProfile.modalities) >= 2
    if normalized_capability == "long_context":
        return ModelProfile.context_window >= 131072
    if normalized_capability == "agents":
        return or_(
            ModelProfile.capabilities.contains(["agents"]),
            ModelProfile.capabilities.contains(["agent"]),
            ModelProfile.capabilities.contains(["agentic"]),
        )
    return ModelProfile.capabilities.contains([normalized_capability])


def _license_filter(categories: list[str]) -> Any:
    clauses: list[Any] = []
    known = or_(
        func.lower(ModelProfile.license).contains("mit"),
        func.lower(ModelProfile.license).contains("apache"),
        func.lower(ModelProfile.license).contains("llama"),
        func.lower(ModelProfile.license).contains("model-specific"),
        func.lower(ModelProfile.license).contains("custom"),
        func.lower(ModelProfile.license).contains("research"),
    )
    for category in categories:
        normalized = category.strip().lower().replace("-", "_").replace(".", "_")
        if normalized == "mit":
            clauses.append(func.lower(ModelProfile.license).contains("mit"))
        elif normalized in {"apache", "apache_2", "apache_2_0"}:
            clauses.append(func.lower(ModelProfile.license).contains("apache"))
        elif normalized in {"llama", "llama_community", "llama_community_license"}:
            clauses.append(func.lower(ModelProfile.license).contains("llama"))
        elif normalized == "model_specific":
            clauses.append(
                or_(
                    func.lower(ModelProfile.license).contains("model-specific"),
                    func.lower(ModelProfile.license).contains("custom"),
                    func.lower(ModelProfile.license).contains("research"),
                )
            )
        elif normalized == "other":
            clauses.append(and_(ModelProfile.license.is_not(None), ~known))
        elif normalized == "unknown":
            clauses.append(ModelProfile.license.is_(None))
    return or_(*clauses) if clauses else None


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


@router.get("/sources/health", tags=["sources"])
def source_health(session: DatabaseSession) -> dict[str, Any]:
    stale_after = timedelta(hours=get_settings().source_stale_after_hours)
    now = datetime.now(UTC)
    sources = session.scalars(select(Source).order_by(Source.name)).all()
    items = []
    for source in sources:
        configured = source.is_active and source_is_configured(source.slug or source.name)
        stale = configured and (
            source.last_success_at is None or now - source.last_success_at > stale_after
        )
        status = source.status
        if not source.is_active:
            status = "disabled"
        elif not configured:
            status = "not_configured"
        elif stale and source.status == "active":
            status = "stale"
        items.append(
            {
                "name": source.name,
                "url": source.url,
                "status": status,
                "last_checked_at": source.last_checked_at,
                "last_success_at": source.last_success_at,
                "has_error": source.last_error is not None,
                "consecutive_failures": source.consecutive_failures,
                "stale": stale,
                "configured": configured,
            }
        )
    return {"checked_at": now, "items": items}


@router.get("/models", tags=["models"])
def list_models(
    session: DatabaseSession,
    company: str | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 50,
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
                "family": model.family,
                "release_date": model.release_date,
                "parameter_count": model.parameter_count,
                "active_parameter_count": model.active_parameter_count,
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


@router.get("/models/facets", tags=["models"])
def model_facets(session: DatabaseSession) -> dict[str, Any]:
    rows = session.execute(
        select(Model, Company, ModelProfile)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
        .join(Company, Company.id == Model.company_id)
    ).all()
    developers: dict[str, dict[str, Any]] = {}
    families: dict[str, int] = {}
    modalities: dict[str, int] = {}
    capabilities: dict[str, int] = {}
    licenses: dict[str, int] = {}
    openness: dict[str, int] = {}
    commercial_use: dict[str, int] = {}
    for model, company, profile in rows:
        item = developers.setdefault(
            company.slug,
            {
                "slug": company.slug,
                "name": company.name,
                "count": 0,
                "website_url": _resolved_company_website(company),
            },
        )
        item["count"] += 1
        if model.family:
            families[model.family] = families.get(model.family, 0) + 1
        for value in profile.modalities:
            modalities[value] = modalities.get(value, 0) + 1
        for value in profile.capabilities:
            capabilities[value] = capabilities.get(value, 0) + 1
        license_category = _license_category(profile.license)
        licenses[license_category] = licenses.get(license_category, 0) + 1
        openness_value = _resolved_compare_openness(model, company, profile) or "unknown"
        openness[openness_value] = openness.get(openness_value, 0) + 1
        commercial_value = profile.commercial_use_status or "unknown"
        commercial_use[commercial_value] = commercial_use.get(commercial_value, 0) + 1
    providers = session.execute(
        select(PriceObservation.provider, func.count(func.distinct(PriceObservation.model_id)))
        .group_by(PriceObservation.provider)
        .order_by(PriceObservation.provider)
    ).all()
    return {
        "developers": sorted(developers.values(), key=lambda item: item["name"]),
        "providers": [{"slug": name, "name": name, "count": count} for name, count in providers],
        "families": [{"name": name, "count": count} for name, count in sorted(families.items())],
        "modalities": [
            {"name": name, "count": count} for name, count in sorted(modalities.items())
        ],
        "capabilities": [
            {"name": name, "count": count} for name, count in sorted(capabilities.items())
        ],
        "licenses": [{"name": name, "count": count} for name, count in sorted(licenses.items())],
        "openness": [{"name": name, "count": count} for name, count in sorted(openness.items())],
        "commercial_use": [
            {"name": name, "count": count} for name, count in sorted(commercial_use.items())
        ],
        "benchmark_focuses": list(BENCHMARK_FOCUSES),
    }


@router.get("/models/search", tags=["models"])
def search_models(
    session: DatabaseSession,
    search: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    developer: Annotated[list[str] | None, Query()] = None,
    provider: Annotated[list[str] | None, Query()] = None,
    family: Annotated[list[str] | None, Query()] = None,
    capability: Annotated[list[str] | None, Query()] = None,
    modality: Annotated[list[str] | None, Query()] = None,
    min_context: Annotated[int | None, Query(ge=1)] = None,
    max_input_price: Annotated[Decimal | None, Query(ge=0)] = None,
    max_output_price: Annotated[Decimal | None, Query(ge=0)] = None,
    tool_calling: bool | None = None,
    reasoning: bool | None = None,
    availability: Literal["open_source", "open_weight", "proprietary", "unknown"] | None = None,
    openness: Annotated[list[str] | None, Query()] = None,
    license: Annotated[list[str] | None, Query()] = None,
    commercial_use: bool | None = None,
    commercial_use_status: Annotated[list[str] | None, Query()] = None,
    benchmark_focus: str | None = None,
    advancedness: Annotated[list[str] | None, Query()] = None,
    sort_by: Annotated[list[str] | None, Query()] = None,
    sort_order: Annotated[list[Literal["asc", "desc"]] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    """Apply simultaneous hard filters and optional evidence-based benchmark ranking."""
    if benchmark_focus and benchmark_focus not in BENCHMARK_FOCUSES:
        raise HTTPException(status_code=422, detail="Unknown benchmark focus")
    normalized_advancedness = {item.lower() for item in advancedness} if advancedness else set()
    if normalized_advancedness:
        allowed = set(ADVANCEDNESS_TIERS) | {"unscored"}
        unknown = normalized_advancedness - allowed
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown advancedness tier: {sorted(unknown)[0]}",
            )
    sort_specs = _normalize_sort_specs(sort_by, sort_order)
    for field, _ in sort_specs:
        if not re.fullmatch(SORT_FIELD_PATTERN, field):
            raise HTTPException(status_code=422, detail=f"Unknown sort field: {field}")
    primary_sort_by = sort_specs[0][0]
    primary_sort_order = sort_specs[0][1]
    filters: list[Any] = []
    if search:
        search_filter = _model_search_filter(search)
        if search_filter is not None:
            filters.append(search_filter)
    if developer:
        filters.append(Company.slug.in_([item.lower() for item in developer]))
    if provider:
        filters.append(
            Model.id.in_(
                select(PriceObservation.model_id).where(
                    func.lower(PriceObservation.provider).in_([item.lower() for item in provider])
                )
            )
        )
    if family:
        filters.append(Model.family.in_(family))
    if min_context is not None:
        filters.append(ModelProfile.context_window >= min_context)
    if max_input_price is not None:
        filters.append(ModelProfile.input_price <= max_input_price)
    if max_output_price is not None:
        filters.append(ModelProfile.output_price <= max_output_price)
    if tool_calling is not None:
        filters.append(ModelProfile.supports_tool_calling.is_(tool_calling))
    if reasoning is not None:
        filters.append(ModelProfile.supports_reasoning.is_(reasoning))
    if availability == "unknown":
        filters.append(or_(ModelProfile.openness.is_(None), ModelProfile.openness == "unknown"))
    elif availability:
        filters.append(ModelProfile.openness == availability)
    # Effective openness (profile openness, else the license-based / curated-
    # family fallback) is denormalized onto ModelProfile.effective_openness by
    # llm_radar.read_model, so it filters and paginates in SQL. The displayed
    # value in serialize() still comes from the live resolver so a not-yet-
    # refreshed row shows the right thing.
    normalized_openness = [item.lower().replace("-", "_") for item in openness] if openness else []
    if normalized_openness:
        filters.append(ModelProfile.effective_openness.in_(normalized_openness))
    license_clause = _license_filter(license or [])
    if license_clause is not None:
        filters.append(license_clause)
    if commercial_use is not None:
        filters.append(ModelProfile.commercial_use_allowed.is_(commercial_use))
    if commercial_use_status:
        normalized_commercial = [item.lower().replace("-", "_") for item in commercial_use_status]
        commercial_clauses: list[Any] = [
            ModelProfile.commercial_use_status.in_(normalized_commercial)
        ]
        if "unknown" in normalized_commercial:
            commercial_clauses.append(ModelProfile.commercial_use_status.is_(None))
        filters.append(or_(*commercial_clauses))
    if capability:
        capability_clauses = [_capability_filter_clause(item) for item in capability]
        if capability_clauses:
            filters.append(or_(*capability_clauses))
    if modality:
        modality_clauses = [ModelProfile.modalities.contains([item.lower()]) for item in modality]
        if modality_clauses:
            filters.append(or_(*modality_clauses))

    backend_name = (
        select(func.min(PriceObservation.provider))
        .where(PriceObservation.model_id == Model.id)
        .correlate(Model)
        .scalar_subquery()
    )
    sort_columns: dict[str, Any] = {
        "name": Model.name,
        "provider": Company.name,
        "context": ModelProfile.context_window,
        "input_price": ModelProfile.input_price,
        "output_price": ModelProfile.output_price,
        "release_date": Model.release_date,
        "parameter_count": Model.parameter_count,
        "active_parameter_count": Model.active_parameter_count,
        "backend": backend_name,
        "updated_at": ModelProfile.updated_at,
        "best_match": Model.name,
    }
    query = (
        select(Model, Company, ModelProfile)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
        .join(Company, Company.id == Model.company_id)
    )
    count_query = (
        select(func.count())
        .select_from(Model)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
        .join(Company, Company.id == Model.company_id)
    )

    # A benchmark-focus score column - general_score by default, or a row from
    # model_focus_scores for any other focus - both denormalized by
    # llm_radar.read_model, so the evidence filter/tier/sort below run in SQL
    # instead of loading every candidate into Python to score it.
    if benchmark_focus == "general":
        score_col: Any = ModelProfile.general_score
        filters.append(ModelProfile.general_score.is_not(None))
    elif benchmark_focus:
        focus_join = and_(
            ModelFocusScore.model_id == Model.id, ModelFocusScore.focus == benchmark_focus
        )
        query = query.join(ModelFocusScore, focus_join)
        count_query = count_query.join(ModelFocusScore, focus_join)
        score_col = ModelFocusScore.score
    else:
        score_col = ModelProfile.general_score

    if normalized_advancedness:
        tier_clauses: list[Any] = []
        if "unscored" in normalized_advancedness:
            tier_clauses.append(score_col.is_(None))
        for tier in normalized_advancedness & set(ADVANCEDNESS_TIERS):
            lower, upper = ADVANCEDNESS_TIERS[tier]
            tier_clauses.append(and_(score_col >= lower, score_col <= upper))
        if tier_clauses:
            filters.append(or_(*tier_clauses))

    if primary_sort_by == "best_match":
        # Same as benchmark_score/desc regardless of the requested sort_order -
        # "best match" always means highest evidence first. Model.name (exact,
        # case-sensitive) then Model.id are the final keys so paging stays
        # deterministic when names tie case-insensitively (e.g. "Kimi-K3" vs
        # "kimi-k3" duplicates) rather than however Postgres breaks the tie.
        order_by: tuple[Any, ...] = (
            score_col.is_(None),
            score_col.desc(),
            func.lower(Model.name),
            Model.name,
            Model.id,
        )
    elif primary_sort_by == "benchmark_score":
        score_order = score_col.asc() if primary_sort_order == "asc" else score_col.desc()
        order_by = (
            score_col.is_(None),
            score_order,
            func.lower(Model.name),
            Model.name,
            Model.id,
        )
    else:
        order_by = tuple(_build_sql_order_by(sort_specs, sort_columns))

    query = query.where(*filters).order_by(*order_by)
    count_query = count_query.where(*filters)

    match_focus = benchmark_focus or "general"
    matches = selection_matches(session, match_focus)

    total = session.scalar(count_query) or 0
    paged_rows = list(session.execute(query.offset(offset).limit(limit)).all())
    provider_by_model: dict[UUID, set[str]] = {}
    paged_model_ids = [model.id for model, _, _ in paged_rows]
    if paged_model_ids:
        for model_id, provider_name in session.execute(
            select(PriceObservation.model_id, PriceObservation.provider)
            .where(PriceObservation.model_id.in_(paged_model_ids))
            .distinct()
        ):
            provider_by_model.setdefault(model_id, set()).add(provider_name)

    def serialize(model: Model, company: Company, profile: ModelProfile) -> dict[str, Any]:
        match = matches.get(canonical_model_name(model.name))
        model_providers = sorted(provider_by_model.get(model.id, set()))
        return {
            "id": str(model.id),
            "slug": model.slug,
            "name": model.name,
            "developer": {
                "slug": company.slug,
                "name": company.name,
                "website_url": _resolved_company_website(company),
            },
            "provider": (
                {"slug": model_providers[0], "name": model_providers[0]}
                if model_providers
                else None
            ),
            "providers": model_providers,
            "family": model.family,
            "release_date": model.release_date,
            "parameter_count": model.parameter_count,
            "active_parameter_count": model.active_parameter_count,
            "context_window": profile.context_window,
            "max_output_tokens": profile.max_output_tokens,
            "pricing": {
                "input": str(profile.input_price) if profile.input_price is not None else None,
                "output": str(profile.output_price) if profile.output_price is not None else None,
                "cache_read": str(profile.cache_read_price)
                if profile.cache_read_price is not None
                else None,
            },
            "modalities": profile.modalities,
            "capabilities": profile.capabilities,
            "tool_calling": profile.supports_tool_calling,
            "reasoning": profile.supports_reasoning,
            "availability": profile.availability,
            "openness": _resolved_compare_openness(model, company, profile) or "unknown",
            "license": profile.license,
            "license_category": _license_category(profile.license),
            "commercial_use_allowed": profile.commercial_use_allowed,
            "commercial_use_status": profile.commercial_use_status or "unknown",
            "field_provenance": profile.field_provenance,
            "observed_at": profile.observed_at,
            "selection": None
            if match is None
            else {
                "benchmark_score": match.score,
                "best_rank": match.best_rank,
                "benchmarks": match.benchmarks,
                "evidence_count": match.evidence_count,
                "basis": match.basis,
                "advancedness_tier": advancedness_tier_for_score(match.score),
                "explanation": (
                    "Zorunlu filtreler uygulandı; doğrulanmış profil modalitelerine göre sıralandı."
                    if match.basis == "profile"
                    else "Zorunlu filtreler uygulandı; ilgili benchmark yüzdeliğine göre sıralandı."
                ),
            },
        }

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "benchmark_focus": benchmark_focus,
        "advancedness": sorted(normalized_advancedness),
        "sort_by": [field for field, _ in sort_specs],
        "sort_order": [order for _, order in sort_specs],
        "items": [serialize(model, company, profile) for model, company, profile in paged_rows],
    }


@router.post("/models/select", tags=["models"])
def select_models(request: ModelSelectionRequest, session: DatabaseSession) -> dict[str, Any]:
    """Return ranked LLMaaS candidates after applying hard, explainable constraints."""
    result = search_models(
        session=session,
        search=request.search,
        developer=request.developers or None,
        provider=request.providers or None,
        family=request.families or None,
        capability=request.required_capabilities or None,
        modality=[str(item) for item in request.required_modalities] or None,
        min_context=request.min_context,
        max_input_price=request.max_input_price,
        max_output_price=request.max_output_price,
        tool_calling=request.requires_tool_calling,
        reasoning=request.requires_reasoning,
        availability=request.availability,
        openness=[str(item) for item in request.openness] or None,
        license=request.licenses or None,
        commercial_use=request.commercial_use,
        commercial_use_status=(
            [str(item) for item in request.commercial_use_statuses] or None
        ),
        benchmark_focus=request.use_case,
        sort_by=["best_match"],
        sort_order=["asc"],
        limit=request.limit,
        offset=0,
    )
    items = result["items"]
    for rank, item in enumerate(items, start=1):
        item["recommendation_rank"] = rank
    return {
        "criteria": request.model_dump(mode="json"),
        "total": result["total"],
        "items": items,
    }


def _compare_modalities(model: Model, profile: ModelProfile | None) -> list[str]:
    if profile is not None and profile.modalities:
        return list(profile.modalities)
    capabilities = model.capabilities if isinstance(model.capabilities, dict) else {}
    merged: list[str] = []
    for key in ("input_modalities", "output_modalities"):
        for item in capabilities.get(key) or []:
            if item and item not in merged:
                merged.append(str(item))
    return merged


@router.get("/models/compare", tags=["models"])
def compare_model_features(
    session: DatabaseSession,
    ids: Annotated[list[UUID], Query(min_length=2, max_length=3)],
) -> dict[str, Any]:
    rows = session.execute(
        select(Model, Company, ModelProfile)
        .join(Company, Company.id == Model.company_id)
        .outerjoin(ModelProfile, ModelProfile.model_id == Model.id)
        .where(Model.id.in_(ids))
    ).all()
    if len(rows) != len(set(ids)):
        raise HTTPException(status_code=404, detail="One or more models were not found")
    benchmark_index = selection_matches(session, "general")
    return {
        "items": [
            {
                "id": str(model.id),
                "name": model.name,
                "provider": {"slug": company.slug, "name": company.name},
                "selection": None
                if (match := benchmark_index.get(canonical_model_name(model.name))) is None
                else {
                    "benchmark_score": match.score,
                    "best_rank": match.best_rank,
                    "benchmarks": list(match.benchmarks),
                    "evidence_count": match.evidence_count,
                },
                "features": {
                    "family": model.family,
                    "context_window": profile.context_window if profile else model.context_window,
                    "max_output_tokens": profile.max_output_tokens if profile else None,
                    "input_price": str(profile.input_price)
                    if profile and profile.input_price is not None
                    else None,
                    "output_price": str(profile.output_price)
                    if profile and profile.output_price is not None
                    else None,
                    "cache_read_price": str(profile.cache_read_price)
                    if profile and profile.cache_read_price is not None
                    else None,
                    "modalities": _compare_modalities(model, profile),
                    "capabilities": profile.capabilities if profile else [],
                    "tool_calling": profile.supports_tool_calling if profile else None,
                    "reasoning": profile.supports_reasoning if profile else None,
                    "availability": _resolved_availability(model, profile)
                    or _resolved_compare_openness(model, company, profile),
                    "openness": _resolved_compare_openness(model, company, profile),
                    "license": _resolved_compare_license(model, company, profile),
                    "license_raw": (profile.license if profile else None) or model.license,
                    "commercial_use_status": profile.commercial_use_status if profile else None,
                },
                "source_id": str(profile.source_id) if profile else None,
                "observed_at": profile.observed_at if profile else None,
            }
            for model, company, profile in rows
        ]
    }


@router.get("/models/{model_id}/history", tags=["models"])
def model_history(
    model_id: UUID,
    session: DatabaseSession,
    metric: Annotated[
        str, Query(pattern="^(input_price|output_price|cache_read_price|context_window)$")
    ],
    limit: Annotated[int, Query(ge=2, le=500)] = 100,
) -> dict[str, Any]:
    if session.get(Model, model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")
    if metric == "context_window":
        snapshots = session.scalars(
            select(ModelSnapshot)
            .where(ModelSnapshot.model_id == model_id)
            .order_by(ModelSnapshot.observed_at.desc())
            .limit(limit)
        ).all()
        points = [
            {"observed_at": row.observed_at, "value": row.data.get("context_window")}
            for row in reversed(snapshots)
            if row.data.get("context_window") is not None
        ]
    else:
        prices = session.scalars(
            select(PriceObservation)
            .where(PriceObservation.model_id == model_id)
            .order_by(PriceObservation.observed_at.desc())
            .limit(limit)
        ).all()
        points = [
            {"observed_at": row.observed_at, "value": str(getattr(row, metric))}
            for row in reversed(prices)
            if getattr(row, metric) is not None
        ]
    return {"model_id": str(model_id), "metric": metric, "items": points}


@router.get("/models/resolve", tags=["models"])
def resolve_model(
    session: DatabaseSession,
    name: Annotated[str, Query(min_length=1, max_length=200)],
    organization: Annotated[str | None, Query(max_length=200)] = None,
) -> dict[str, Any]:
    catalog_index = _leaderboard_license_index(session)
    model = _resolve_catalog_model(session, name, organization or "", catalog_index)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found in catalog")
    company = session.get(Company, model.company_id)
    return {
        "id": str(model.id),
        "slug": model.slug,
        "name": model.name,
        "company": company.name if company is not None else None,
    }


@router.get("/models/{model_id}", tags=["models"])
def model_detail(model_id: UUID, session: DatabaseSession) -> dict[str, Any]:
    model = session.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    company = session.get(Company, model.company_id)
    profile = session.get(ModelProfile, model.id)
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
        sid
        for sid in (
            ([snapshot.source_id] if snapshot else [])
            + ([profile.source_id] if profile else [])
            + [p.source_id for p in prices]
        )
        if sid is not None
    ]
    unique_source_ids = list(dict.fromkeys(src_ids))
    source_rows: dict[Any, Any] = {}
    if unique_source_ids:
        source_rows = {
            s.id: s
            for s in session.scalars(select(Source).where(Source.id.in_(unique_source_ids))).all()
        }
    model_key = canonical_model_name(model.name)
    benchmarks = session.scalars(select(BenchmarkDefinition)).all()
    benchmark_scores = []
    if model_key:
        # One pass over every benchmark's latest published leaderboard instead of
        # two queries per benchmark definition. Canonical-name matching stays in
        # Python, so the rows are filtered here rather than in SQL.
        latest_published = (
            select(
                LeaderboardSnapshot.benchmark_id.label("benchmark_id"),
                func.max(LeaderboardSnapshot.published_at).label("published_at"),
            )
            .group_by(LeaderboardSnapshot.benchmark_id)
            .subquery()
        )
        latest_rows = session.scalars(
            select(LeaderboardSnapshot).join(
                latest_published,
                and_(
                    LeaderboardSnapshot.benchmark_id == latest_published.c.benchmark_id,
                    LeaderboardSnapshot.published_at == latest_published.c.published_at,
                ),
            )
        ).all()
        best_by_benchmark: dict[UUID, LeaderboardSnapshot] = {}
        for row in latest_rows:
            if canonical_model_name(row.model_external_id) != model_key:
                continue
            current = best_by_benchmark.get(row.benchmark_id)
            if current is None or row.rank < current.rank:
                best_by_benchmark[row.benchmark_id] = row
        for benchmark in benchmarks:
            best = best_by_benchmark.get(benchmark.id)
            if best is None:
                continue
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
        "family": model.family,
        "version": model.version,
        "release_date": model.release_date,
        "parameter_count": model.parameter_count,
        "active_parameter_count": model.active_parameter_count,
        "status": model.status,
        "company": {"slug": company.slug, "name": company.name} if company else None,
        "context_window": (
            profile.context_window
            if profile is not None and profile.context_window is not None
            else model.context_window
        ),
        "capabilities": model.capabilities,
        "profile": (
            {
                "max_output_tokens": profile.max_output_tokens,
                "modalities": profile.modalities or [],
                "capabilities": profile.capabilities or [],
                "tool_calling": profile.supports_tool_calling,
                "structured_output": profile.supports_structured_output,
                "reasoning": profile.supports_reasoning,
                "streaming": profile.supports_streaming,
                "availability": _resolved_availability(model, profile),
                "openness": (
                    _resolved_compare_openness(model, company, profile)
                    if company is not None
                    else profile.openness
                ),
                "license": (
                    _resolved_compare_license(model, company, profile)
                    if company is not None
                    else (profile.license or model.license)
                ),
                "commercial_use_status": profile.commercial_use_status,
                "observed_at": profile.observed_at,
            }
            if profile is not None
            else {
                "max_output_tokens": None,
                "modalities": [],
                "capabilities": [],
                "tool_calling": None,
                "structured_output": None,
                "reasoning": None,
                "streaming": None,
                "availability": _resolved_availability(model, None),
                "openness": (
                    _resolved_compare_openness(model, company, None)
                    if company is not None
                    else None
                ),
                "license": (
                    _resolved_compare_license(model, company, None)
                    if company is not None
                    else model.license
                ),
                "commercial_use_status": None,
                "observed_at": None,
            }
        ),
        "description": (
            _translate_to_turkish(snapshot.data.get("description")) if snapshot else None
        ),
        "tokenizer": snapshot.data.get("tokenizer") if snapshot else None,
        "created": snapshot.data.get("created") if snapshot else None,
        "pricing": (
            {
                "input": str(prices[0].input_price) if prices[0].input_price is not None else None,
                "output": (
                    str(prices[0].output_price) if prices[0].output_price is not None else None
                ),
                "cache_read": (
                    str(prices[0].cache_read_price)
                    if prices[0].cache_read_price is not None
                    else None
                ),
                "currency": prices[0].currency,
                "unit": prices[0].unit,
                "observed_at": prices[0].observed_at,
            }
            if prices
            else None
        ),
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
    category: str | None = None,
    search: Annotated[str | None, Query(max_length=160)] = None,
    importance: Literal["critical", "high", "medium", "low", "info"] | None = None,
    since: datetime | None = None,
    min_score: Annotated[int | None, Query(ge=0, le=100)] = None,
    openness: Literal["open_source", "open_weight", "proprietary"] | None = None,
    model_level: Literal["frontier", "advanced", "mid"] | None = None,
    sort_by: Literal["priority", "importance", "recent"] = "importance",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    filters: list[Any] = []
    if event_type:
        filters.append(ChangeEvent.event_type == event_type)
    if category:
        if category not in EVENT_CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown event category")
        filters.append(ChangeEvent.category == category)
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(ChangeEvent.title.ilike(term), ChangeEvent.description.ilike(term)))
    if importance:
        filters.append(ChangeEvent.importance == importance)
    if since is not None:
        filters.append(ChangeEvent.detected_at >= since)
    if min_score is not None:
        filters.append(ChangeEvent.importance_score >= min_score)
    # ChangeEvent.id is the final key everywhere so paging is deterministic
    # across requests when the leading keys tie.
    ordering = (
        (ChangeEvent.importance_score.desc(), ChangeEvent.detected_at.desc(), ChangeEvent.id)
        if sort_by == "importance"
        else (ChangeEvent.detected_at.desc(), ChangeEvent.id)
    )

    # model_openness / model_level belong to the model an event is about; they
    # are denormalized onto model_profiles by llm_radar.read_model. LEFT JOIN so
    # non-model events still flow through, and filter / sort / paginate in SQL
    # rather than materializing every candidate in memory.
    score = ModelProfile.general_score
    query = (
        select(ChangeEvent, ModelProfile.effective_openness, score)
        .outerjoin(
            ModelProfile,
            and_(
                ChangeEvent.entity_type == "model",
                ModelProfile.model_id == ChangeEvent.entity_id,
            ),
        )
        .where(*filters)
    )
    if openness is not None:
        query = query.where(
            ChangeEvent.entity_type == "model", ModelProfile.effective_openness == openness
        )
    if model_level is not None:
        lower, upper = {
            "mid": (Decimal(40), Decimal(70)),
            "advanced": (Decimal(70), Decimal(85)),
            "frontier": (Decimal(85), Decimal("100.1")),
        }[model_level]
        query = query.where(
            ChangeEvent.entity_type == "model", score >= lower, score < upper
        )

    if sort_by == "priority":
        # Urgent news (critical/high) always outranks model level, so a critical
        # security or regulation item is never buried under a routine
        # frontier-model event. Within each urgency band, prefer higher model
        # levels, then the importance score, then recency.
        urgent_rank = case((ChangeEvent.importance.in_(("critical", "high")), 0), else_=1)
        level_rank = case(
            (score.is_(None), 4),
            (score >= 85, 0),
            (score >= 70, 1),
            (score >= 40, 2),
            else_=3,
        )
        order_by: tuple[Any, ...] = (
            urgent_rank,
            level_rank,
            ChangeEvent.importance_score.desc(),
            ChangeEvent.detected_at.desc(),
            ChangeEvent.id,
        )
    else:
        order_by = ordering

    total = (
        session.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    )
    rows = session.execute(query.order_by(*order_by).limit(limit).offset(offset)).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "category": event.category,
                "entity_type": event.entity_type,
                "entity_id": str(event.entity_id),
                "title": event.title,
                "old_value": event.old_value,
                "new_value": event.new_value,
                "change_percentage": (
                    str(event.change_percentage) if event.change_percentage is not None else None
                ),
                "importance": event.importance,
                "importance_score": event.importance_score,
                "importance_factors": event.importance_factors,
                "model_openness": effective_openness,
                "model_level": advancedness_tier_for_score(
                    float(general_score) if general_score is not None else None
                ),
                "evidence": event.evidence,
                "verification_status": event.verification_status,
                "detected_at": event.detected_at,
            }
            for event, effective_openness, general_score in rows
        ],
    }
