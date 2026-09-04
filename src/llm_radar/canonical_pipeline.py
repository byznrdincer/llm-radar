"""Source → observe → resolve → deduplicate → canonical model pipeline helpers."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import (
    AnalyticsEvent,
    ChangeEvent,
    Claim,
    EntityAlias,
    FieldObservation,
    Model,
    ModelProfile,
    ModelSnapshot,
    ModelVersion,
    PriceObservation,
    ProviderEndpoint,
)
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


def merge_runtime_capabilities(existing: list[str] | None, payload: dict[str, Any]) -> list[str]:
    merged = {str(item).strip().lower() for item in (existing or []) if str(item).strip()}
    for key in RUNTIME_CAPABILITY_KEYS:
        if payload.get(key) is True:
            merged.add(key)
    for item in payload.get("capabilities") or []:
        normalized = str(item).strip().lower()
        if normalized:
            merged.add(normalized)
    return sorted(merged)


# models.id is referenced by a plain FK here; repoint every row.
_MODEL_FK_TABLES: tuple[type[Any], ...] = (ModelSnapshot, PriceObservation, ProviderEndpoint)
# entity_type/entity_id provenance rows for a model.
_MODEL_PROVENANCE_TABLES: tuple[type[Any], ...] = (FieldObservation, Claim, ChangeEvent)
# scalar catalog fields worth carrying over when the canonical row lacks them.
_ENRICHABLE_MODEL_FIELDS = (
    "family",
    "version",
    "release_date",
    "is_open_weight",
    "license",
    "context_window",
    "parameter_count",
    "active_parameter_count",
)


def merge_models(session: Session, *, source: Model, target: Model) -> None:
    """Fold a duplicate model row into its canonical row.

    Repoints every child, provenance and analytics row from ``source`` onto
    ``target``, fills the canonical row's still-empty scalar fields from the
    duplicate, rewrites aliases that pointed at the duplicate, then deletes
    ``source``. Safe to call inside the processor transaction - a duplicate that
    was just created simply has no child rows to move yet.
    """
    if source.id == target.id:
        return

    for field in _ENRICHABLE_MODEL_FIELDS:
        if getattr(target, field) is None and getattr(source, field) is not None:
            setattr(target, field, getattr(source, field))
    session.flush()

    for table in _MODEL_FK_TABLES:
        session.execute(update(table).where(table.model_id == source.id).values(model_id=target.id))

    # model_versions carries a unique (model_id, version): drop colliding rows.
    target_versions = set(
        session.scalars(select(ModelVersion.version).where(ModelVersion.model_id == target.id))
    )
    session.execute(
        delete(ModelVersion).where(
            ModelVersion.model_id == source.id, ModelVersion.version.in_(target_versions)
        )
    )
    session.execute(
        update(ModelVersion).where(ModelVersion.model_id == source.id).values(model_id=target.id)
    )

    # model_profiles is keyed by model_id: keep the canonical row's own profile
    # if it has one, otherwise hand it the duplicate's.
    if session.scalar(select(ModelProfile.model_id).where(ModelProfile.model_id == source.id)):
        target_has_profile = session.scalar(
            select(ModelProfile.model_id).where(ModelProfile.model_id == target.id)
        )
        if target_has_profile:
            session.execute(delete(ModelProfile).where(ModelProfile.model_id == source.id))
        else:
            session.execute(
                update(ModelProfile)
                .where(ModelProfile.model_id == source.id)
                .values(model_id=target.id)
            )

    for table in _MODEL_PROVENANCE_TABLES:
        session.execute(
            update(table)
            .where(table.entity_type == "model", table.entity_id == source.id)
            .values(entity_id=target.id)
        )
    session.execute(
        update(AnalyticsEvent)
        .where(AnalyticsEvent.model_id == source.id)
        .values(model_id=target.id)
    )

    session.execute(
        update(EntityAlias)
        .where(EntityAlias.canonical_key == source.slug)
        .values(canonical_key=target.slug)
    )
    remember_alias(session, target.slug, source.slug, method="merged_duplicate")

    session.flush()
    session.execute(delete(Model).where(Model.id == source.id))
    session.expunge(source)
    # Child rows were repointed with Core statements; drop any now-stale ORM
    # state so later access reloads against the merged row.
    session.expire_all()


def link_cross_source_models(
    session: Session,
    model: Model,
    *,
    entity_key: str,
    display_name: str,
    is_new: bool,
) -> Model | None:
    """Merge a freshly created provider-specific row into an existing canonical
    model when they denote the same thing. Returns the canonical model to keep
    using, or ``None`` when ``model`` stands on its own."""
    if not is_new:
        return None
    canonical = canonical_model_name(display_name)
    if not canonical:
        return None
    variant = model_variant_identity(entity_key)
    keys = {entity_key.lower(), variant.lower(), canonical}
    for candidate in session.scalars(select(Model).where(Model.id != model.id)).all():
        candidate_keys = {
            candidate.slug.lower(),
            model_variant_identity(candidate.slug),
            canonical_model_name(candidate.name),
        }
        if keys & candidate_keys:
            # merge_models already aliases the duplicate's slug (== entity_key)
            # onto the canonical row; add the variant key too.
            merge_models(session, source=model, target=candidate)
            if variant != entity_key:
                remember_alias(session, candidate.slug, variant, method="variant_identity")
            return candidate
    return None
