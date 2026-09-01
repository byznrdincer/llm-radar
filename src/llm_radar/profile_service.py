from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.database.models import Model, ModelProfile, Source
from llm_radar.model_features import NormalizedModelFeatures, normalize_model_features
from llm_radar.model_identity import model_variant_identity
from llm_radar.normalize import parse_utc_datetime
from llm_radar.source_resolution import source_score

SCALAR_FIELDS = (
    "context_window",
    "max_output_tokens",
    "input_price",
    "output_price",
    "cache_read_price",
    "supports_tool_calling",
    "supports_structured_output",
    "supports_reasoning",
    "supports_streaming",
    "availability",
    "openness",
    "license",
    "commercial_use_allowed",
    "commercial_use_status",
)
LIST_FIELDS = ("modalities", "capabilities")


def _field_is_asserted(payload: dict[str, Any], field: str) -> bool:
    pricing = payload.get("pricing")
    price_keys = {
        "input_price": "input_per_1m_tokens",
        "output_price": "output_per_1m_tokens",
        "cache_read_price": "cache_read_per_1m_tokens",
    }
    if field in price_keys:
        return isinstance(pricing, dict) and price_keys[field] in pricing
    aliases = {
        "supports_tool_calling": ("supports_tool_calling", "tool_calling"),
        "supports_structured_output": ("supports_structured_output", "structured_output"),
        "supports_reasoning": ("supports_reasoning", "reasoning"),
        "supports_streaming": ("supports_streaming", "streaming"),
        "availability": ("availability", "is_open_weight"),
        "openness": ("openness", "is_open_source", "is_open_weight", "availability"),
        "commercial_use_allowed": ("commercial_use_allowed", "license"),
        "commercial_use_status": (
            "commercial_use_status",
            "commercial_use_allowed",
            "license",
        ),
        "modalities": ("input_modalities", "output_modalities"),
        "capabilities": ("capabilities", "supported_parameters"),
    }
    return any(key in payload for key in aliases.get(field, (field,)))


def _source(session: Session, source_id: UUID | str | None) -> Source | None:
    if source_id is None:
        return None
    try:
        return session.get(Source, UUID(str(source_id)))
    except ValueError:
        return None


def _may_replace(
    *,
    current_source: Source | None,
    incoming_source: Source | None,
    current_observed_at: datetime,
    incoming_observed_at: datetime,
) -> bool:
    if current_source is None or incoming_source is None:
        return incoming_observed_at >= current_observed_at
    if current_source.id == incoming_source.id:
        return incoming_observed_at >= current_observed_at
    current_score = source_score(current_source)
    incoming_score = source_score(incoming_source)
    if incoming_score > current_score:
        return True
    if incoming_score == current_score:
        return incoming_observed_at >= current_observed_at
    return incoming_observed_at >= current_observed_at + timedelta(days=30)


def _legacy_huggingface_availability(
    normalized: NormalizedModelFeatures, payload: dict[str, Any], source: Source | None
) -> NormalizedModelFeatures:
    """Reject historical HF-presence-as-open-weight snapshots without evidence."""
    if (
        source is not None
        and source.name == "huggingface"
        and normalized.availability == "open_weight"
        and not payload.get("open_weight_evidence")
    ):
        return replace(normalized, availability=None)
    return normalized


def upsert_model_profile(
    session: Session,
    *,
    model: Model,
    source_id: UUID,
    observed_at: datetime,
    payload: dict[str, Any],
) -> tuple[ModelProfile, NormalizedModelFeatures, bool]:
    """Merge one snapshot field-by-field with source and observation provenance."""
    incoming_source = _source(session, source_id)
    normalized = _legacy_huggingface_availability(
        normalize_model_features(payload), payload, incoming_source
    )
    profile = session.get(ModelProfile, model.id)
    is_new = profile is None
    if profile is None:
        profile = ModelProfile(
            model_id=model.id,
            source_id=source_id,
            observed_at=observed_at,
            field_provenance={},
        )
        session.add(profile)

    provenance = dict(profile.field_provenance or {})
    changed = is_new
    for field in (*SCALAR_FIELDS, *LIST_FIELDS):
        incoming = getattr(normalized, field)
        if not _field_is_asserted(payload, field):
            continue
        current = getattr(profile, field)
        field_meta = provenance.get(field, {})
        current_observed_at = (
            parse_utc_datetime(field_meta.get("observed_at")) or profile.observed_at
        )
        current_source = _source(
            session, field_meta.get("source_id") or (profile.source_id if not field_meta else None)
        )
        if current is not None and not _may_replace(
            current_source=current_source,
            incoming_source=incoming_source,
            current_observed_at=current_observed_at,
            incoming_observed_at=observed_at,
        ):
            continue
        if current != incoming:
            setattr(profile, field, incoming)
            changed = True
        provenance[field] = {
            "source_id": str(source_id),
            "source": incoming_source.name if incoming_source else None,
            "observed_at": observed_at.isoformat(),
        }
        if field == "availability":
            evidence = payload.get("open_weight_evidence") or payload.get("availability_evidence")
            if evidence:
                provenance[field]["evidence"] = evidence

    profile.field_provenance = provenance
    if changed:
        profile.source_id = source_id
        if observed_at >= profile.observed_at:
            profile.observed_at = observed_at

    model.context_window = profile.context_window
    model.license = profile.license
    if profile.openness in {"open_source", "open_weight"} or profile.availability == "open_weight":
        model.is_open_weight = True
    elif profile.openness == "proprietary" or profile.availability == "proprietary":
        model.is_open_weight = False
    else:
        model.is_open_weight = None

    return profile, normalized, changed


def propagate_open_weight_evidence(
    session: Session,
    *,
    model: Model,
    source_id: UUID,
    observed_at: datetime,
    payload: dict[str, Any],
) -> int:
    """Apply verified weight evidence to hosting/precision variants of one base model."""
    if payload.get("is_open_weight") is not True or not payload.get("open_weight_evidence"):
        return 0
    return propagate_availability_evidence(
        session,
        model=model,
        source_id=source_id,
        observed_at=observed_at,
        payload=payload,
    )


def propagate_availability_evidence(
    session: Session,
    *,
    model: Model,
    source_id: UUID,
    observed_at: datetime,
    payload: dict[str, Any],
) -> int:
    """Apply evidence-backed availability to hosting/precision variants."""
    availability = payload.get("availability")
    if availability is None:
        if payload.get("is_open_weight") is True:
            availability = "open_weight"
        elif payload.get("is_open_weight") is False:
            availability = "proprietary"
    evidence = payload.get("open_weight_evidence") or payload.get("availability_evidence")
    if availability not in {"open_source", "open_weight", "proprietary"} or not evidence:
        return 0
    identity = model_variant_identity(model.slug)
    related = session.scalars(select(Model).where(Model.company_id == model.company_id)).all()
    inherited_payload: dict[str, Any] = {
        "is_open_source": availability == "open_source",
        "is_open_weight": availability in {"open_source", "open_weight"},
        "openness": availability,
        "availability": availability,
        "availability_evidence": evidence,
    }
    if availability in {"open_source", "open_weight"}:
        inherited_payload["open_weight_evidence"] = evidence
    for field in ("license", "commercial_use_allowed"):
        if field in payload:
            inherited_payload[field] = payload[field]

    updated = 0
    for candidate in related:
        if candidate.id == model.id or model_variant_identity(candidate.slug) != identity:
            continue
        _, _, accepted = upsert_model_profile(
            session,
            model=candidate,
            source_id=source_id,
            observed_at=observed_at,
            payload=inherited_payload,
        )
        updated += int(accepted)
    return updated
