"""Turkish-signal model detection and listing."""

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.api.deps import DatabaseSession
from llm_radar.composite import canonical_model_name
from llm_radar.database.models import Company, Model, ModelProfile, ModelSnapshot
from llm_radar.model_selection import selection_matches

router = APIRouter(prefix="/api/v1")

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


@router.get("/models/turkish", tags=["models"])
def turkish_models(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    return list_turkish_models(session, limit)


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
