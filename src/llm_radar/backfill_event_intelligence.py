from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.database.models import (
    ChangeEvent,
    OutboxEvent,
    ResearchPaper,
    Source,
    TechnologySignal,
)
from llm_radar.database.session import SessionLocal
from llm_radar.events.schemas import EventEnvelope, EventType
from llm_radar.events.topics import PROCESSED_EVENTS
from llm_radar.processor.common import _change_event
from llm_radar.processor.handlers import _handle_announcement

ANNOUNCEMENT_TYPES = {
    EventType.COMPANY_ANNOUNCEMENT,
    EventType.GITHUB_RELEASE_PUBLISHED,
    EventType.AI_AGENT_UPDATED,
    EventType.PRODUCT_LAUNCHED,
    EventType.FUNDING_ANNOUNCED,
    EventType.ACQUISITION_ANNOUNCED,
    EventType.PARTNERSHIP_ANNOUNCED,
    EventType.INFRASTRUCTURE_UPDATED,
    EventType.REGULATION_UPDATED,
    EventType.SECURITY_ADVISORY,
    EventType.API_UPDATED,
}


@dataclass(frozen=True, slots=True)
class EventBackfillResult:
    scanned: int
    created: int


def _source(session: Session, event: EventEnvelope) -> Source | None:
    return session.scalar(
        select(Source).where((Source.slug == event.source) | (Source.name == event.source))
    )


def _already_recorded(session: Session, event_type: str, entity_id: object) -> bool:
    return (
        session.scalar(
            select(ChangeEvent.id).where(
                ChangeEvent.event_type == event_type,
                ChangeEvent.entity_id == entity_id,
            )
        )
        is not None
    )


def backfill_event_intelligence(session: Session) -> EventBackfillResult:
    """Recover change events that older processor versions failed to persist."""
    rows = session.scalars(
        select(OutboxEvent)
        .where(OutboxEvent.topic == PROCESSED_EVENTS)
        .order_by(OutboxEvent.created_at)
    ).all()
    scanned = 0
    created = 0
    for row in rows:
        payload = row.payload or {}
        if not {"source", "entity_key", "metadata"}.issubset(payload):
            continue
        try:
            event = EventEnvelope.model_validate(payload)
        except ValueError:
            continue
        if event.event_type not in ANNOUNCEMENT_TYPES | {
            EventType.RESEARCH_PUBLISHED,
            EventType.TECHNOLOGY_DETECTED,
        }:
            continue
        source = _source(session, event)
        if source is None:
            continue
        scanned += 1
        changes: list[ChangeEvent] = []
        if event.event_type in ANNOUNCEMENT_TYPES:
            changes = _handle_announcement(session, event, source)
        elif event.event_type == EventType.RESEARCH_PUBLISHED:
            external_id = str(event.payload.get("arxiv_id") or event.entity_key)
            paper = session.scalar(
                select(ResearchPaper).where(ResearchPaper.external_id == external_id)
            )
            if paper is not None and not _already_recorded(
                session, event.event_type.value, paper.id
            ):
                changes = [
                    _change_event(
                        event=event,
                        source=source,
                        entity_type="paper",
                        entity_id=paper.id,
                        title=paper.title,
                        new_value=event.payload,
                    )
                ]
        else:
            slug = str(event.payload.get("signal") or event.entity_key)
            signal = session.scalar(select(TechnologySignal).where(TechnologySignal.slug == slug))
            if signal is not None and not _already_recorded(
                session, event.event_type.value, signal.id
            ):
                changes = [
                    _change_event(
                        event=event,
                        source=source,
                        entity_type="technology",
                        entity_id=signal.id,
                        title=f"Teknoloji sinyali: {signal.name}",
                        new_value=event.payload,
                    )
                ]
        if changes:
            session.add_all(changes)
            session.flush()
            created += len(changes)
    return EventBackfillResult(scanned=scanned, created=created)


def main() -> None:
    with SessionLocal() as session:
        result = backfill_event_intelligence(session)
        session.commit()
    print(f"Event intelligence backfill: {result.scanned} scanned, {result.created} created")


if __name__ == "__main__":
    main()
