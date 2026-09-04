"""Shared processor helpers: source upsert, observation + change-event
construction, and cross-source corroboration. Used by the event handlers,
process_event, and the event-intelligence backfill."""

import logging
from decimal import Decimal
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import (
    ChangeEvent,
    FieldObservation,
    Model,
    Source,
)
from llm_radar.event_intelligence import classify_event, score_importance
from llm_radar.events.schemas import EventEnvelope, EventType

logger = logging.getLogger(__name__)

_ANNOUNCEMENT_EVENT_TYPES = {
    EventType.COMPANY_ANNOUNCEMENT.value,
    EventType.GITHUB_RELEASE_PUBLISHED.value,
    EventType.AI_AGENT_UPDATED.value,
    EventType.PRODUCT_LAUNCHED.value,
    EventType.FUNDING_ANNOUNCED.value,
    EventType.ACQUISITION_ANNOUNCED.value,
    EventType.PARTNERSHIP_ANNOUNCED.value,
    EventType.INFRASTRUCTURE_UPDATED.value,
    EventType.REGULATION_UPDATED.value,
    EventType.SECURITY_ADVISORY.value,
    EventType.API_UPDATED.value,
}
_ANNOUNCEMENT_CHANGE_TYPES = _ANNOUNCEMENT_EVENT_TYPES | {EventType.MODEL_RELEASED.value}


def _match_profile_model(session: Session, model_name: str) -> Model | None:
    canonical = canonical_model_name(model_name)
    if not canonical:
        return None
    candidates = [
        model
        for model in session.scalars(select(Model))
        if ":" not in model.slug and canonical_model_name(model.name) == canonical
    ]
    return candidates[0] if len(candidates) == 1 else None


def _upsert_source(session: Session, event: EventEnvelope) -> Source:
    source = session.scalar(
        select(Source).where((Source.slug == event.source) | (Source.name == event.source))
    )
    if source is None:
        source = Source(
            name=event.source,
            slug=event.source,
            url=str(event.metadata.source_url),
            source_type="api",
            reliability_level=event.metadata.reliability.value,
        )
        session.add(source)
        session.flush()
    if not source.slug:
        source.slug = event.source
    source.last_checked_at = event.collected_at
    source.last_success_at = event.collected_at
    source.status = "active"
    source.last_error = None
    source.consecutive_failures = 0
    return source


def _record_observation(
    session: Session,
    *,
    entity_type: str,
    entity_id: Any,
    field_name: str,
    value: Any,
    previous: Any,
    source: Source,
    event: EventEnvelope,
) -> None:
    session.execute(
        update(FieldObservation)
        .where(
            FieldObservation.entity_type == entity_type,
            FieldObservation.entity_id == entity_id,
            FieldObservation.field_name == field_name,
            FieldObservation.is_current.is_(True),
        )
        .values(is_current=False)
    )
    session.add(
        FieldObservation(
            entity_type=entity_type,
            entity_id=entity_id,
            field_name=field_name,
            value={"value": value},
            valid_from=event.occurred_at,
            collected_at=event.collected_at,
            source_id=source.id,
            reliability=event.metadata.reliability.value,
            verification_status=event.metadata.verification_status.value,
            extraction_method=event.metadata.extraction_method,
            previous_value={"value": previous} if previous is not None else None,
            is_current=True,
        )
    )


def _change_event(
    *,
    event: EventEnvelope,
    source: Source,
    entity_type: str,
    entity_id: Any,
    title: str,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    change_percentage: Decimal | None = None,
    event_type: str | None = None,
) -> ChangeEvent:
    kind = event_type or event.event_type.value
    payload = {
        "change_percentage": str(change_percentage) if change_percentage is not None else None,
        "new_value": new_value or {},
        "rank": (new_value or {}).get("rank"),
    }
    importance = score_importance(
        kind,
        payload,
        title=title,
        reliability=event.metadata.reliability.value,
        verification_status=event.metadata.verification_status.value,
    )
    return ChangeEvent(
        event_type=kind,
        category=classify_event(kind, title, event.payload),
        entity_type=entity_type,
        entity_id=entity_id,
        title=title[:240],
        old_value=old_value,
        new_value=new_value,
        change_percentage=change_percentage,
        importance=importance.level,
        importance_score=importance.score,
        importance_factors=importance.factors,
        confidence=event.metadata.verification_status.value,
        verification_status=event.metadata.verification_status.value,
        evidence={
            "source": event.source,
            "source_url": str(event.metadata.source_url),
            "reliability": event.metadata.reliability.value,
            "collected_at": event.collected_at.isoformat(),
            "raw_object_key": event.metadata.raw_object_key,
            "sources": [
                {
                    "source_id": str(source.id),
                    "source": event.source,
                    "source_url": str(event.metadata.source_url),
                    "reliability": event.metadata.reliability.value,
                    "collected_at": event.collected_at.isoformat(),
                }
            ],
        },
        source_id=source.id,
        detected_at=event.collected_at,
    )


def _corroborate_change(existing: ChangeEvent, event: EventEnvelope, source: Source) -> None:
    evidence = dict(existing.evidence or {})
    sources = list(evidence.get("sources") or [])
    if not sources and evidence.get("source"):
        sources.append(
            {
                "source_id": str(existing.source_id),
                "source": evidence.get("source"),
                "source_url": evidence.get("source_url"),
                "reliability": evidence.get("reliability"),
                "collected_at": evidence.get("collected_at"),
            }
        )
    if all(item.get("source_id") != str(source.id) for item in sources):
        sources.append(
            {
                "source_id": str(source.id),
                "source": event.source,
                "source_url": str(event.metadata.source_url),
                "reliability": event.metadata.reliability.value,
                "collected_at": event.collected_at.isoformat(),
            }
        )
    evidence["sources"] = sources
    evidence["corroboration_count"] = len({item.get("source_id") for item in sources})
    existing.evidence = evidence
    existing.verification_status = "corroborated"
    existing.confidence = "corroborated"
    result = score_importance(
        existing.event_type,
        {
            "new_value": existing.new_value or {},
            "change_percentage": existing.change_percentage,
        },
        title=existing.title,
        reliability=str(evidence.get("reliability") or event.metadata.reliability.value),
        verification_status="corroborated",
    )
    existing.importance = result.level
    existing.importance_score = result.score
    existing.importance_factors = result.factors

