"""Turkish-signal model detection and listing."""

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.api.deps import DatabaseSession
from llm_radar.composite import canonical_model_name
from llm_radar.database.models import Company, Model, ModelProfile, ModelSnapshot
from llm_radar.model_selection import selection_matches
from llm_radar.normalize import company_display_name

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
    "ytu-ce-cosmos",
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
    "berturk",
    "turkiye",
    "türkiye",
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
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
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


def _snapshot_str(snapshot: ModelSnapshot | None, *keys: str) -> str | None:
    if not snapshot or not isinstance(snapshot.data, dict):
        return None
    for key in keys:
        value = snapshot.data.get(key)
        if isinstance(value, list):
            for entry in value:
                if entry not in (None, ""):
                    return str(entry)
            continue
        if value not in (None, ""):
            return str(value)
    return None


def _snapshot_datasets(snapshot: ModelSnapshot | None) -> list[str]:
    if not snapshot or not isinstance(snapshot.data, dict):
        return []
    raw = snapshot.data.get("datasets")
    if isinstance(raw, list):
        return [str(entry) for entry in raw if entry not in (None, "")][:6]
    if raw not in (None, ""):
        return [str(raw)]
    return []


def _infer_technique(snapshot: ModelSnapshot | None) -> str | None:
    if not snapshot or not isinstance(snapshot.data, dict):
        return None
    stored = snapshot.data.get("technique")
    if isinstance(stored, str) and stored.strip():
        return stored.strip()
    pipeline = str(snapshot.data.get("pipeline_tag") or "").strip().lower()
    tasks = snapshot.data.get("tasks")
    haystack = " ".join(str(entry) for entry in tasks).lower() if isinstance(tasks, list) else ""
    base = _snapshot_str(snapshot, "base_model")
    name = str(snapshot.data.get("name") or "").lower()
    evidence = snapshot.data.get("open_weight_evidence")
    evidence_haystack = ""
    if isinstance(evidence, dict):
        evidence_haystack = " ".join(str(entry) for entry in evidence.get("files", [])).lower()
    if pipeline in {"feature-extraction", "sentence-similarity"}:
        return "Embedding"
    if pipeline == "fill-mask":
        return "Pretrained"
    if pipeline in {
        "text-classification",
        "token-classification",
        "question-answering",
        "summarization",
        "zero-shot-classification",
    }:
        return "Encoder"
    if pipeline == "text-ranking":
        return "Reranker"
    if "gguf" in name or "gguf" in haystack or "gguf" in evidence_haystack:
        return "Quantized"
    if "finetune" in haystack or "fine-tune" in haystack or "instruct" in name or bool(base):
        return "Fine-tuned"
    if pipeline in {
        "text-generation",
        "text2text-generation",
        "conversational",
        "image-text-to-text",
    }:
        return "Base"
    return None


def _organization_label(company: Company) -> str:
    mapped = company_display_name(company.slug)
    # Prefer the curated label when we have one; otherwise keep the DB name.
    defaulted = company.slug.replace("-", " ").title()
    if mapped != defaulted:
        return mapped
    return company.name


def _source_url(model: Model, company: Company, snapshot: ModelSnapshot | None) -> str | None:
    if snapshot and isinstance(snapshot.data, dict):
        for key in ("url", "repository"):
            value = snapshot.data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        evidence = snapshot.data.get("open_weight_evidence")
        if isinstance(evidence, dict):
            repo = evidence.get("repository")
            if isinstance(repo, str) and repo.strip():
                return repo.strip()
        external_id = snapshot.data.get("external_id")
        if isinstance(external_id, str) and "/" in external_id:
            return f"https://huggingface.co/{external_id}"
    slug = f"{company.slug}/{model.slug}".strip("/")
    if company.slug and model.slug:
        return f"https://huggingface.co/{slug}"
    return None


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
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
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
                "organization": _organization_label(company),
                "base_model": (
                    snapshot.data.get("base_model")
                    if snapshot and isinstance(snapshot.data, dict)
                    else None
                ),
                "technique": _infer_technique(snapshot),
                "datasets": _snapshot_datasets(snapshot),
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
                "source_url": _source_url(model, company, snapshot),
                "benchmark_score": (
                    benchmark_index[canonical_model_name(model.name)].score
                    if canonical_model_name(model.name) in benchmark_index
                    else None
                ),
                "published_at": (
                    snapshot.data.get("published_at")
                    if snapshot and isinstance(snapshot.data, dict)
                    else None
                ),
                "last_updated": (
                    (
                        snapshot.data.get("last_modified")
                        if snapshot and isinstance(snapshot.data, dict)
                        else None
                    )
                    or (profile.observed_at if profile else model.updated_at)
                ),
            }
            for model, company, profile, snapshot, _downloads in candidates[:limit]
        ],
    }
