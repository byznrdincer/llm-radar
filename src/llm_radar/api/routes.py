from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.config import get_settings, source_is_configured
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
from llm_radar.event_intelligence import EVENT_CATEGORIES
from llm_radar.model_selection import BENCHMARK_FOCUSES, selection_matches

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
    availability: Literal["open_weight", "proprietary", "unknown"] | None = None
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


_UNKNOWN_LICENSES = {"", "unknown", "n/a", "none", "null", "-"}


def _meaningful_license(value: str | None) -> str | None:
    if value is None or value.strip().lower() in _UNKNOWN_LICENSES:
        return None
    return value.strip()


def _catalog_model_license(model: Model, profile: ModelProfile | None) -> str | None:
    availability = (profile.availability if profile else None) or ""
    availability = availability.strip().lower().replace("-", "_")
    license_name = _meaningful_license((profile.license if profile else None) or model.license)
    if availability == "proprietary" or model.is_open_weight is False:
        return "Proprietary"
    if availability == "open_weight" or model.is_open_weight is True:
        return license_name or "Open"
    return license_name


def _known_family_license(model_name: str, organization: str) -> str | None:
    """Use only family-level rules whose public/closed distribution is unambiguous."""
    name = model_name.strip().lower().replace("_", "-")
    org = organization.strip().lower().replace(" ", "")
    if "gpt-oss" in name:
        return "Open"
    if org in {"anthropic"} and "claude" in name:
        return "Proprietary"
    if org in {"openai"} and (
        "gpt" in name or name.startswith(("o1", "o3", "o4"))
    ):
        return "Proprietary"
    if org in {"google", "gemini"} and "gemini" in name:
        return "Proprietary"
    if "grok" in name and org in {"xai", "spacexai", "pickle"}:
        return "Open" if name in {"grok-1", "grok 1"} else "Proprietary"
    if "qwen" in name:
        return (
            "Proprietary"
            if any(tier in name for tier in ("max", "plus", "turbo"))
            else "Open"
        )
    if (org in {"zai", "zhipuai"} or "zhipu" in org) and "glm" in name:
        return "MIT"
    open_family_signals = (
        "deepseek",
        "exaone",
        "gemma",
        "kimi-k2",
        "llama",
        "nemotron",
        "opencodereasoning",
        "openreasoning",
        "phi-4",
        "qwq",
        "seed-oss",
    )
    if any(signal in name for signal in open_family_signals):
        return "Open"
    return None


def _leaderboard_license_index(
    session: DatabaseSession,
) -> dict[str, list[tuple[Model, ModelProfile | None, str]]]:
    index: dict[str, list[tuple[Model, ModelProfile | None, str]]] = {}
    rows = session.execute(
        select(Model, ModelProfile, Company.name)
        .outerjoin(ModelProfile, ModelProfile.model_id == Model.id)
        .join(Company, Company.id == Model.company_id)
    )
    for model, profile, company_name in rows:
        key = canonical_model_name(model.name)
        if key:
            index.setdefault(key, []).append((model, profile, company_name))
    return index


def _resolve_leaderboard_license(
    *,
    raw_license: str | None,
    model_name: str,
    organization: str,
    catalog_index: dict[str, list[tuple[Model, ModelProfile | None, str]]],
) -> tuple[str, str]:
    explicit = _meaningful_license(raw_license)
    if explicit:
        return explicit, "benchmark"

    candidates = catalog_index.get(canonical_model_name(model_name), [])
    organization_key = canonical_model_name(organization)
    same_company = [
        candidate
        for candidate in candidates
        if canonical_model_name(candidate[2]) == organization_key
    ]
    if same_company:
        candidates = same_company
    catalog_licenses = {
        license_name
        for model, profile, _company_name in candidates
        if (license_name := _catalog_model_license(model, profile)) is not None
    }
    catalog_classes = {
        "closed" if license_name.lower() == "proprietary" else "open"
        for license_name in catalog_licenses
    }
    if len(catalog_classes) == 1:
        if "closed" in catalog_classes:
            return "Proprietary", "catalog_profile"
        return sorted(catalog_licenses)[0], "catalog_profile"

    family_license = _known_family_license(model_name, organization)
    if family_license:
        return family_license, "verified_family"
    return "Unknown", "unresolved"


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
                "rating_lower": (
                    float(row.score_lower) if row.score_lower is not None else None
                ),
                "rating_upper": (
                    float(row.score_upper) if row.score_upper is not None else None
                ),
                "vote_count": row.vote_count,
                "rank": display_rank,
                "category": row.category,
                "leaderboard_publish_date": row.published_at,
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
    for model, company, profile in rows:
        item = developers.setdefault(
            company.slug, {"slug": company.slug, "name": company.name, "count": 0}
        )
        item["count"] += 1
        if model.family:
            families[model.family] = families.get(model.family, 0) + 1
        for value in profile.modalities:
            modalities[value] = modalities.get(value, 0) + 1
        for value in profile.capabilities:
            capabilities[value] = capabilities.get(value, 0) + 1
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
    availability: Literal["open_weight", "proprietary", "unknown"] | None = None,
    commercial_use: bool | None = None,
    benchmark_focus: str | None = None,
    sort_by: Annotated[
        str, Query(pattern="^(name|context|input_price|output_price|updated_at|best_match)$")
    ] = "name",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    """Apply simultaneous hard filters and optional evidence-based benchmark ranking."""
    if benchmark_focus and benchmark_focus not in BENCHMARK_FOCUSES:
        raise HTTPException(status_code=422, detail="Unknown benchmark focus")
    filters: list[Any] = []
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            Model.name.ilike(pattern) | Model.slug.ilike(pattern) | Company.name.ilike(pattern)
        )
    if developer:
        filters.append(Company.slug.in_([item.lower() for item in developer]))
    if provider:
        filters.append(
            Model.id.in_(
                select(PriceObservation.model_id).where(
                    PriceObservation.provider.in_([item.lower() for item in provider])
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
        filters.append(ModelProfile.availability.is_(None))
    elif availability:
        filters.append(ModelProfile.availability == availability)
    if commercial_use is not None:
        filters.append(ModelProfile.commercial_use_allowed.is_(commercial_use))
    for item in capability or []:
        filters.append(ModelProfile.capabilities.contains([item.lower()]))
    for item in modality or []:
        filters.append(ModelProfile.modalities.contains([item.lower()]))

    sort_columns: dict[str, Any] = {
        "name": Model.name.asc(),
        "context": ModelProfile.context_window.desc().nullslast(),
        "input_price": ModelProfile.input_price.asc().nullslast(),
        "output_price": ModelProfile.output_price.asc().nullslast(),
        "updated_at": ModelProfile.updated_at.desc(),
        "best_match": Model.name.asc(),
    }
    query = (
        select(Model, Company, ModelProfile)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
        .join(Company, Company.id == Model.company_id)
        .where(*filters)
        .order_by(sort_columns[sort_by])
    )
    rows = list(session.execute(query).all())
    matches = selection_matches(session, benchmark_focus) if benchmark_focus else {}
    if benchmark_focus:
        rows = [row for row in rows if canonical_model_name(row[0].name) in matches]
        rows.sort(
            key=lambda row: (
                -matches[canonical_model_name(row[0].name)].score,
                row[2].input_price is None,
                row[2].input_price or Decimal("0"),
                row[0].name,
            )
        )
    total = len(rows)
    paged_rows = rows[offset : offset + limit]
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
            "developer": {"slug": company.slug, "name": company.name},
            "provider": (
                {"slug": model_providers[0], "name": model_providers[0]}
                if model_providers
                else None
            ),
            "providers": model_providers,
            "family": model.family,
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
            "license": profile.license,
            "commercial_use_allowed": profile.commercial_use_allowed,
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
                "explanation": (
                    "Zorunlu filtreler uygulandı; doğrulanmış profil modalitelerine göre "
                    "sıralandı."
                    if match.basis == "profile"
                    else "Zorunlu filtreler uygulandı; ilgili benchmark yüzdeliğine göre "
                    "sıralandı."
                ),
            },
        }

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "benchmark_focus": benchmark_focus,
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
        commercial_use=request.commercial_use,
        benchmark_focus=request.use_case,
        sort_by="best_match",
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
    return {
        "items": [
            {
                "id": str(model.id),
                "name": model.name,
                "provider": {"slug": company.slug, "name": company.name},
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
                    "modalities": profile.modalities if profile else [],
                    "capabilities": profile.capabilities if profile else [],
                    "tool_calling": profile.supports_tool_calling if profile else None,
                    "reasoning": profile.supports_reasoning if profile else None,
                    "availability": profile.availability if profile else None,
                    "license": profile.license if profile else model.license,
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
        sid
        for sid in ([snapshot.source_id] if snapshot else []) + [p.source_id for p in prices]
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
        "family": model.family,
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
    category: str | None = None,
    importance: Literal["critical", "high", "medium", "low", "info"] | None = None,
    since: datetime | None = None,
    min_score: Annotated[int | None, Query(ge=0, le=100)] = None,
    sort_by: Literal["importance", "recent"] = "importance",
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
    if importance:
        filters.append(ChangeEvent.importance == importance)
    if since is not None:
        filters.append(ChangeEvent.detected_at >= since)
    if min_score is not None:
        filters.append(ChangeEvent.importance_score >= min_score)
    total = session.scalar(select(func.count()).select_from(ChangeEvent).where(*filters)) or 0
    ordering = (
        (ChangeEvent.importance_score.desc(), ChangeEvent.detected_at.desc())
        if sort_by == "importance"
        else (ChangeEvent.detected_at.desc(),)
    )
    events = session.scalars(
        select(ChangeEvent).where(*filters).order_by(*ordering).limit(limit).offset(offset)
    ).all()
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
                "evidence": event.evidence,
                "verification_status": event.verification_status,
                "detected_at": event.detected_at,
            }
            for event in events
        ],
    }
