import logging
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from llm_radar.catalog import EVENT_BY_TYPE, importance_for
from llm_radar.database.models import (
    BenchmarkDefinition,
    ChangeEvent,
    Claim,
    Company,
    FieldObservation,
    LeaderboardSnapshot,
    Model,
    ModelSnapshot,
    PriceObservation,
    ProcessedEvent,
    ResearchPaper,
    Source,
    TechnologySignal,
)
from llm_radar.events.schemas import EventEnvelope, EventType
from llm_radar.notifications import dispatch_notifications
from llm_radar.pipeline import canonical_hash, duplicate_reasons, remember_fingerprint
from llm_radar.processor.change_detector import detect_changes
from llm_radar.resolution import resolve_entity_key

logger = logging.getLogger(__name__)


def _decimal(value: Any) -> Decimal | None:
    return Decimal(str(value)) if value not in (None, "") else None


def _company_slug(entity_key: str) -> str:
    return entity_key.split("/", 1)[0].lower()


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
    return ChangeEvent(
        event_type=kind,
        entity_type=entity_type,
        entity_id=entity_id,
        title=title[:240],
        old_value=old_value,
        new_value=new_value,
        change_percentage=change_percentage,
        importance=importance_for(kind, payload).value,
        confidence=event.metadata.verification_status.value,
        verification_status=event.metadata.verification_status.value,
        evidence={
            "source": event.source,
            "source_url": str(event.metadata.source_url),
            "reliability": event.metadata.reliability.value,
            "collected_at": event.collected_at.isoformat(),
            "raw_object_key": event.metadata.raw_object_key,
        },
        source_id=source.id,
        detected_at=event.collected_at,
    )


def _handle_leaderboard(
    session: Session, event: EventEnvelope, source: Source
) -> list[ChangeEvent]:
    payload = event.payload
    benchmark_slug = str(payload["benchmark_slug"])
    benchmark = session.scalar(
        select(BenchmarkDefinition).where(BenchmarkDefinition.slug == benchmark_slug)
    )
    if benchmark is None:
        benchmark = BenchmarkDefinition(
            source_id=source.id,
            slug=benchmark_slug,
            name=str(payload["benchmark_name"]),
            category=str(payload["category"]),
            methodology_url=str(event.metadata.source_url),
        )
        session.add(benchmark)
        session.flush()
    previous_leaderboard = session.scalar(
        select(LeaderboardSnapshot)
        .where(
            LeaderboardSnapshot.benchmark_id == benchmark.id,
            LeaderboardSnapshot.model_external_id == payload["model_name"],
            LeaderboardSnapshot.category == payload["category"],
        )
        .order_by(LeaderboardSnapshot.published_at.desc())
        .limit(1)
    )
    published_at = date.fromisoformat(str(payload["leaderboard_publish_date"]))
    changes: list[ChangeEvent] = []
    if previous_leaderboard is None or previous_leaderboard.published_at != published_at:
        snapshot = LeaderboardSnapshot(
            benchmark_id=benchmark.id,
            source_id=source.id,
            model_external_id=str(payload["model_name"]),
            organization=str(payload["organization"]),
            license=payload.get("license"),
            category=str(payload["category"]),
            rank=int(payload["rank"]),
            score=_decimal(payload["rating"]) or Decimal("0"),
            score_lower=_decimal(payload.get("rating_lower")),
            score_upper=_decimal(payload.get("rating_upper")),
            vote_count=int(payload["vote_count"]) if payload.get("vote_count") else None,
            published_at=published_at,
            observed_at=event.collected_at,
            raw_data=payload,
        )
        session.add(snapshot)
        session.flush()
        if previous_leaderboard is not None and previous_leaderboard.rank != snapshot.rank:
            changes.append(
                _change_event(
                    event=event,
                    source=source,
                    entity_type="leaderboard_entry",
                    entity_id=snapshot.id,
                    title=f"{snapshot.model_external_id}: Arena rank changed",
                    old_value={"rank": previous_leaderboard.rank},
                    new_value={"rank": snapshot.rank},
                    event_type=EventType.LEADERBOARD_CHANGED.value,
                )
            )
    return changes


def _handle_research(session: Session, event: EventEnvelope, source: Source) -> list[ChangeEvent]:
    payload = event.payload
    external_id = str(payload.get("arxiv_id") or event.entity_key)
    paper = session.scalar(select(ResearchPaper).where(ResearchPaper.external_id == external_id))
    if paper is not None:
        return []
    published = None
    raw_date = str(payload.get("published_at") or "")[:10]
    if raw_date:
        try:
            published = date.fromisoformat(raw_date)
        except ValueError:
            published = None
    paper = ResearchPaper(
        external_id=external_id,
        title=str(payload.get("title") or external_id)[:500],
        authors=payload.get("authors") or [],
        abstract=payload.get("abstract"),
        published_at=published,
        url=str(payload.get("url") or event.metadata.source_url),
        categories=payload.get("categories") or [],
        source_id=source.id,
        observed_at=event.collected_at,
    )
    session.add(paper)
    session.flush()
    return [
        _change_event(
            event=event,
            source=source,
            entity_type="paper",
            entity_id=paper.id,
            title=paper.title,
            new_value=payload,
        )
    ]


def _handle_technology(session: Session, event: EventEnvelope, source: Source) -> list[ChangeEvent]:
    slug = str(event.payload.get("signal") or event.entity_key)
    signal = session.scalar(select(TechnologySignal).where(TechnologySignal.slug == slug))
    if signal is None:
        signal = TechnologySignal(
            slug=slug,
            name=slug.replace("_", " ").title(),
            category=slug,
            first_seen_at=event.collected_at,
            last_seen_at=event.collected_at,
            evidence=event.payload,
            source_id=source.id,
            strength="medium",
        )
        session.add(signal)
        session.flush()
        return [
            _change_event(
                event=event,
                source=source,
                entity_type="technology",
                entity_id=signal.id,
                title=f"Teknoloji sinyali: {signal.name}",
                new_value=event.payload,
            )
        ]
    signal.last_seen_at = event.collected_at
    signal.evidence = event.payload
    return []


def _handle_announcement(
    session: Session, event: EventEnvelope, source: Source
) -> list[ChangeEvent]:
    entity_id = uuid5(NAMESPACE_URL, event.entity_key)
    existing = session.scalar(
        select(ChangeEvent).where(
            ChangeEvent.event_type == event.event_type.value,
            ChangeEvent.title == str(event.payload.get("title") or event.entity_key)[:240],
        )
    )
    if existing is not None:
        return []
    return [
        _change_event(
            event=event,
            source=source,
            entity_type=EVENT_BY_TYPE.get(event.event_type.value).entity_type
            if event.event_type.value in EVENT_BY_TYPE
            else "company",
            entity_id=entity_id,
            title=str(event.payload.get("title") or event.payload.get("name") or event.entity_key),
            new_value=event.payload,
        )
    ]


def _handle_model(session: Session, event: EventEnvelope, source: Source) -> list[ChangeEvent]:
    resolution = resolve_entity_key(
        session, event.entity_key, str(event.payload.get("name") or event.entity_key)
    )
    company_slug = _company_slug(event.entity_key)
    company = session.scalar(select(Company).where(Company.slug == company_slug))
    if company is None:
        company = Company(name=company_slug.replace("-", " ").title(), slug=company_slug)
        session.add(company)
        session.flush()

    model = session.scalar(select(Model).where(Model.slug == event.entity_key)) or session.scalar(
        select(Model).where(Model.slug == resolution.canonical_key)
    )
    is_new = model is None
    payload = event.payload
    if model is None:
        model = Model(
            company_id=company.id,
            name=str(payload.get("name") or event.entity_key),
            slug=event.entity_key,
            context_window=payload.get("context_window"),
            license=payload.get("license"),
            is_open_weight=payload.get("is_open_weight"),
            status=str(payload.get("status") or "active"),
            capabilities={
                "input_modalities": payload.get("input_modalities", []),
                "output_modalities": payload.get("output_modalities", []),
            },
        )
        session.add(model)
        session.flush()

    previous_model = session.scalar(
        select(ModelSnapshot)
        .where(ModelSnapshot.model_id == model.id)
        .order_by(ModelSnapshot.observed_at.desc())
        .limit(1)
    )
    digest = canonical_hash(payload)
    changes: list[ChangeEvent] = []

    if previous_model is None or previous_model.content_hash != digest:
        if is_new:
            changes.append(
                _change_event(
                    event=event,
                    source=source,
                    entity_type="model",
                    entity_id=model.id,
                    title=f"{model.name} discovered",
                    new_value=payload,
                    event_type=EventType.MODEL_RELEASED.value,
                )
            )
        elif previous_model is not None:
            for change in detect_changes(previous_model.data, payload):
                changes.append(
                    _change_event(
                        event=event,
                        source=source,
                        entity_type="model",
                        entity_id=model.id,
                        title=f"{model.name}: {change.field} changed",
                        old_value={change.field: change.old_value},
                        new_value={change.field: change.new_value},
                        change_percentage=change.percentage,
                        event_type=change.event_type.value,
                    )
                )
                _record_observation(
                    session,
                    entity_type="model",
                    entity_id=model.id,
                    field_name=change.field,
                    value=change.new_value,
                    previous=change.old_value,
                    source=source,
                    event=event,
                )

        model.name = str(payload.get("name") or model.name)
        if payload.get("context_window") is not None:
            model.context_window = payload.get("context_window")
        if payload.get("license"):
            model.license = payload.get("license")
        if payload.get("is_open_weight") is not None:
            model.is_open_weight = payload.get("is_open_weight")
        if payload.get("status"):
            model.status = str(payload.get("status"))
        model.capabilities = {
            "input_modalities": payload.get(
                "input_modalities", model.capabilities.get("input_modalities", [])
            ),
            "output_modalities": payload.get(
                "output_modalities", model.capabilities.get("output_modalities", [])
            ),
        }
        session.add(
            ModelSnapshot(
                model_id=model.id,
                source_id=source.id,
                data=payload,
                content_hash=digest,
                observed_at=event.collected_at,
            )
        )
        pricing = payload.get("pricing") or {}
        if pricing:
            session.add(
                PriceObservation(
                    model_id=model.id,
                    source_id=source.id,
                    provider=event.source,
                    input_price=_decimal(pricing.get("input_per_1m_tokens")),
                    output_price=_decimal(pricing.get("output_per_1m_tokens")),
                    cache_read_price=_decimal(pricing.get("cache_read_per_1m_tokens")),
                    cache_write_price=_decimal(pricing.get("cache_write_per_1m_tokens")),
                    currency=pricing.get("currency", "USD"),
                    observed_at=event.collected_at,
                )
            )
        session.add(
            Claim(
                entity_type="model",
                entity_id=model.id,
                field_name="snapshot",
                value=payload,
                source_id=source.id,
                asserted_at=event.occurred_at,
                collected_at=event.collected_at,
                reliability=event.metadata.reliability.value,
                verification_status=event.metadata.verification_status.value,
                extraction_method=event.metadata.extraction_method,
                evidence={"source_url": str(event.metadata.source_url)},
            )
        )
        session.add_all(changes)
    return changes


def process_event(session: Session, event: EventEnvelope) -> list[ChangeEvent]:
    fingerprints = {
        "event_id": str(event.event_id),
        "content_hash": event.metadata.content_hash or canonical_hash(event.payload),
        "entity_type_date": canonical_hash(
            {
                "entity": event.entity_key,
                "type": event.event_type.value,
                "day": event.occurred_at.date().isoformat(),
            }
        ),
    }
    if duplicate_reasons(session, event.event_id, fingerprints):
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
    }
    handler = handlers.get(event.event_type, _handle_model)
    if event.event_type == EventType.HUGGINGFACE_UPDATED:
        handler = _handle_model
    changes = handler(session, event, source)
    for kind, value in fingerprints.items():
        remember_fingerprint(session, kind, value, event.event_id)
    session.add(ProcessedEvent(event_id=event.event_id, source=event.source))
    if changes:
        session.flush()
        dispatch_notifications(session, changes)
    session.commit()
    return changes
