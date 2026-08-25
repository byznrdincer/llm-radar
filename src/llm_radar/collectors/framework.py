from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select
from tenacity import retry, stop_after_attempt, wait_exponential

from llm_radar.catalog import SOURCE_BY_SLUG, importance_for
from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.database.models import CollectorRun, Source, SourceDocument
from llm_radar.database.session import SessionLocal
from llm_radar.events.producer import EventProducer
from llm_radar.events.schemas import EventEnvelope
from llm_radar.events.topics import RAW_UPDATES
from llm_radar.pipeline import canonical_hash
from llm_radar.storage import archive_json

logger = logging.getLogger(__name__)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
async def collect_with_retry(collector: BaseCollector) -> CollectorResult:
    return await collector.collect()


def _source_row(name: str) -> Source | None:
    with SessionLocal() as session:
        return session.scalar(select(Source).where((Source.slug == name) | (Source.name == name)))


def record_health(name: str, *, error: Exception | None = None) -> None:
    spec = SOURCE_BY_SLUG.get(name)
    now = datetime.now(UTC)
    with SessionLocal() as session:
        source = session.scalar(select(Source).where((Source.slug == name) | (Source.name == name)))
        if source is None:
            source = Source(
                name=name,
                slug=name,
                url=spec.url if spec else "",
                source_type=spec.collection_method.value if spec else "api",
                category=spec.category.value if spec else "market",
                source_class=spec.source_class.value if spec else "independent",
                collection_method=spec.collection_method.value if spec else "rest",
                reliability_level=spec.reliability if spec else "third_party",
            )
            session.add(source)
        source.last_checked_at = now
        if error is None:
            source.status = "active"
            source.last_success_at = now
            source.last_error = None
            source.consecutive_failures = 0
        else:
            source.status = "error"
            source.last_error = str(error)[:1000]
            source.consecutive_failures += 1
        session.commit()


def _persist_run(
    collector_name: str,
    *,
    status: str,
    events_published: int = 0,
    error: str | None = None,
    raw_object_key: str | None = None,
    source_id: Any = None,
) -> None:
    with SessionLocal() as session:
        session.add(
            CollectorRun(
                collector_name=collector_name,
                source_id=source_id,
                finished_at=datetime.now(UTC),
                status=status,
                events_published=events_published,
                error=error,
                raw_object_key=raw_object_key,
            )
        )
        if raw_object_key and source_id is not None:
            session.add(
                SourceDocument(
                    source_id=source_id,
                    url=SOURCE_BY_SLUG[collector_name].url
                    if collector_name in SOURCE_BY_SLUG
                    else collector_name,
                    content_hash=canonical_hash(raw_object_key),
                    object_key=raw_object_key,
                    fetched_at=datetime.now(UTC),
                )
            )
        session.commit()


def enrich_event(event: EventEnvelope, raw_object_key: str | None) -> EventEnvelope:
    digest = canonical_hash(
        {"entity": event.entity_key, "type": event.event_type.value, "payload": event.payload}
    )
    event.metadata.content_hash = digest
    event.metadata.raw_object_key = raw_object_key
    event.importance = type(event.importance)(
        importance_for(event.event_type.value, event.payload).value
    )
    return event


async def publish_collection(collector: BaseCollector) -> int:
    source = _source_row(collector.name)
    try:
        result = await collect_with_retry(collector)
        object_key = archive_json(collector.name, result.raw_payload)
        producer = EventProducer()
        for event in result.events:
            enrich_event(event, object_key)
            producer.publish(RAW_UPDATES, event)
        remaining = producer.flush(30)
        if remaining:
            raise RuntimeError(f"{remaining} events could not be delivered")
        record_health(collector.name)
        _persist_run(
            collector.name,
            status="success",
            events_published=len(result.events),
            raw_object_key=object_key,
            source_id=source.id if source else None,
        )
        logger.info("%s: published %s events", collector.name, len(result.events))
        return len(result.events)
    except Exception as error:
        record_health(collector.name, error=error)
        _persist_run(
            collector.name,
            status="error",
            error=str(error)[:1000],
            source_id=source.id if source else None,
        )
        logger.exception("%s collection failed", collector.name)
        return 0


async def collect_once(factory: Callable[[httpx.AsyncClient], BaseCollector]) -> int:
    timeout = httpx.Timeout(90.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        return await publish_collection(factory(client))
