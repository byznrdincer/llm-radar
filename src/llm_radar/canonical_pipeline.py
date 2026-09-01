"""Source → observe → resolve → deduplicate → canonical model pipeline helpers."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import Model
from llm_radar.model_identity import model_variant_identity
from llm_radar.pipeline import canonical_hash
from llm_radar.resolution import Resolution, remember_alias, resolve_entity_key

RUNTIME_CAPABILITY_KEYS = (
    "local_runnable",
    "ollama_compatible",
    "lm_studio_compatible",
)


def observation_fingerprints(event_id: UUID, payload: dict[str, Any]) -> dict[str, str]:
    """Fingerprints used to skip duplicate raw observations."""
    external_id = str(payload.get("external_id") or "").strip().lower()
    fingerprints: dict[str, str] = {"content_hash": canonical_hash(payload)}
    if external_id:
        fingerprints["external_id"] = external_id
    runtime = str(payload.get("runtime_platform") or "").strip().lower()
    if runtime and external_id:
        fingerprints[f"{runtime}_id"] = external_id
    return fingerprints


def resolve_canonical(
    session: Session | None, entity_key: str, display_name: str | None = None
) -> Resolution:
    return resolve_entity_key(session, entity_key, display_name)


def merge_runtime_capabilities(
    existing: list[str] | None, payload: dict[str, Any]
) -> list[str]:
    merged = {str(item).strip().lower() for item in (existing or []) if str(item).strip()}
    for key in RUNTIME_CAPABILITY_KEYS:
        if payload.get(key) is True:
            merged.add(key)
    for item in payload.get("capabilities") or []:
        normalized = str(item).strip().lower()
        if normalized:
            merged.add(normalized)
    return sorted(merged)


def link_cross_source_models(
    session: Session,
    model: Model,
    *,
    entity_key: str,
    display_name: str,
    is_new: bool,
) -> None:
    """Link provider-specific aliases when the same logical model already exists."""
    if not is_new:
        return
    canonical = canonical_model_name(display_name)
    if not canonical:
        return
    variant = model_variant_identity(entity_key)
    keys = {entity_key.lower(), variant.lower(), canonical}
    for candidate in session.scalars(select(Model).where(Model.id != model.id)).all():
        candidate_keys = {
            candidate.slug.lower(),
            model_variant_identity(candidate.slug),
            canonical_model_name(candidate.name),
        }
        if keys & candidate_keys:
            remember_alias(session, candidate.slug, entity_key, method="canonical_name")
            if variant != entity_key:
                remember_alias(session, candidate.slug, variant, method="variant_identity")
            break
