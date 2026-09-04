"""Event processing entry point: idempotency guard, handler dispatch,
change-event persistence, notifications and outbox writes."""

import json
import logging

from sqlalchemy.orm import Session

from llm_radar.canonical_pipeline import (
    observation_fingerprints,
)
from llm_radar.database.models import (
    ChangeEvent,
    OutboxEvent,
    ProcessedEvent,
)
from llm_radar.events.schemas import EventEnvelope, EventType
from llm_radar.events.topics import PROCESSED_EVENTS, TOPIC_BY_EVENT_TYPE
from llm_radar.notifications import dispatch_notifications
from llm_radar.pipeline import canonical_hash, duplicate_reasons, remember_fingerprint
from llm_radar.processor.common import _ANNOUNCEMENT_EVENT_TYPES, _upsert_source
from llm_radar.processor.handlers import (
    _handle_announcement,
    _handle_leaderboard,
    _handle_model,
    _handle_research,
    _handle_technology,
)

logger = logging.getLogger(__name__)


def process_event(session: Session, event: EventEnvelope) -> list[ChangeEvent]:
    fingerprints = {
        "event_id": str(event.event_id),
        "entity_type_date": canonical_hash(
            {
                "entity": event.entity_key,
                "type": event.event_type.value,
                "day": event.occurred_at.date().isoformat(),
            }
        ),
        **observation_fingerprints(event.event_id, event.payload),
    }
    reasons = duplicate_reasons(session, event.event_id, fingerprints)
    if "event_id" in reasons or (
        "content_hash" in reasons and event.event_type.value not in _ANNOUNCEMENT_EVENT_TYPES
    ):
        return []

    source = _upsert_source(session, event)
    handlers = {
        EventType.LEADERBOARD_CHANGED: _handle_leaderboard,
        EventType.RESEARCH_PUBLISHED: _handle_research,
        EventType.TECHNOLOGY_DETECTED: _handle_technology,
        EventType.COMPANY_ANNOUNCEMENT: _handle_announcement,
        EventType.GITHUB_RELEASE_PUBLISHED: _handle_announcement,
        EventType.BENCHMARK_UPDATED: _handle_announcement,
        EventType.MARKET_SHARE_CHANGED: _handle_announcement,
        EventType.AI_AGENT_UPDATED: _handle_announcement,
        EventType.PRODUCT_LAUNCHED: _handle_announcement,
        EventType.FUNDING_ANNOUNCED: _handle_announcement,
        EventType.ACQUISITION_ANNOUNCED: _handle_announcement,
        EventType.PARTNERSHIP_ANNOUNCED: _handle_announcement,
        EventType.INFRASTRUCTURE_UPDATED: _handle_announcement,
        EventType.REGULATION_UPDATED: _handle_announcement,
        EventType.SECURITY_ADVISORY: _handle_announcement,
        EventType.API_UPDATED: _handle_announcement,
    }
    handler = handlers.get(event.event_type, _handle_model)
    if event.event_type == EventType.HUGGINGFACE_UPDATED:
        handler = _handle_model
    changes = handler(session, event, source)
    for kind, value in fingerprints.items():
        remember_fingerprint(session, kind, value, event.event_id)
    session.add(ProcessedEvent(event_id=event.event_id, source=event.source))
    if changes:
        session.add_all(changes)
        session.flush()
        dispatch_notifications(session, changes)
        for change in changes:
            session.add(
                OutboxEvent(
                    topic=TOPIC_BY_EVENT_TYPE.get(change.event_type, PROCESSED_EVENTS),
                    event_key=str(change.entity_id),
                    payload={
                        "event_id": str(change.id),
                        "event_type": change.event_type,
                        "entity_type": change.entity_type,
                        "entity_id": str(change.entity_id),
                        "old_value": change.old_value,
                        "new_value": change.new_value,
                        "importance": change.importance,
                        "source_id": str(change.source_id),
                        "detected_at": change.detected_at.isoformat(),
                    },
                )
            )
    session.add(
        OutboxEvent(
            topic=PROCESSED_EVENTS,
            event_key=event.entity_key,
            payload=json.loads(event.model_dump_json()),
        )
    )
    session.commit()
    return changes
