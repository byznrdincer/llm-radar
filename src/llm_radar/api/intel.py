import asyncio
import json
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.catalog import (
    EVENT_CATALOG,
    RANKING_CATEGORIES,
    SOURCE_CATALOG,
    UNITS,
    VALUE_SCENARIOS,
)
from llm_radar.collectors.arxiv import ArxivCollector
from llm_radar.collectors.github import GitHubCollector
from llm_radar.collectors.huggingface import HuggingFaceCollector
from llm_radar.collectors.openrouter import OpenRouterCollector
from llm_radar.config import get_settings, source_is_configured
from llm_radar.database.models import (
    ChangeEvent,
    CollectorRun,
    DeadLetterEvent,
    Notification,
    ResearchPaper,
    Source,
    TechnologySignal,
)
from llm_radar.database.session import get_db
from llm_radar.event_intelligence import EVENT_CATEGORIES, classify_event
from llm_radar.ranking import ranking_catalog, value_score
from llm_radar.resolution import remember_alias

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]


def _translate_to_turkish(text: str | None) -> str | None:
    if not text:
        return text
    try:
        response = httpx.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "auto", "tl": "tr", "dt": "t", "q": text},
            timeout=3.0,
        )
        response.raise_for_status()
        payload = response.json()
        parts = payload[0] if isinstance(payload, list) and payload else []
        translated = "".join(
            segment[0] for segment in parts if isinstance(segment, list) and segment
        ).strip()
        return translated or text
    except Exception:
        return text


def require_admin(x_admin_token: Annotated[str | None, Header()] = None) -> None:
    expected = get_settings().admin_api_token
    if get_settings().app_env == "production" and not expected:
        raise HTTPException(status_code=503, detail="Admin token is not configured")
    if expected and x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@router.get("/catalog/events", tags=["catalog"])
def event_catalog() -> dict[str, Any]:
    return {
        "units": UNITS,
        "items": [
            {
                "event_type": item.event_type,
                "label": item.label,
                "description": item.description,
                "default_importance": item.default_importance.value,
                "entity_type": item.entity_type,
                "category": classify_event(item.event_type),
            }
            for item in EVENT_CATALOG
        ],
        "categories": [{"slug": slug, "label": label} for slug, label in EVENT_CATEGORIES.items()],
    }


@router.get("/catalog/sources", tags=["catalog"])
def source_catalog(session: DatabaseSession) -> dict[str, Any]:
    rows = {row.slug or row.name: row for row in session.scalars(select(Source)).all()}
    items = []
    for spec in SOURCE_CATALOG:
        row = rows.get(spec.slug)
        configured = source_is_configured(spec.slug)
        items.append(
            {
                "slug": spec.slug,
                "name": spec.name,
                "url": spec.url,
                "category": spec.category.value,
                "source_class": spec.source_class.value,
                "collection_method": spec.collection_method.value,
                "check_interval_seconds": spec.check_interval_seconds,
                "rate_limit_per_minute": spec.rate_limit_per_minute,
                "auth_type": spec.auth_type,
                "reliability": spec.reliability,
                "terms_url": spec.terms_url,
                "is_active": configured and (spec.is_active if row is None else row.is_active),
                "configured": configured,
                "status": (
                    "not_configured"
                    if not configured
                    else (None if row is None else row.status)
                ),
                "last_success_at": None if row is None else row.last_success_at,
                "last_error": None if row is None else row.last_error,
            }
        )
    return {"items": items}


@router.get("/research", tags=["research"])
def list_research(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    papers = session.scalars(
        select(ResearchPaper).order_by(ResearchPaper.observed_at.desc()).limit(limit)
    ).all()
    return {
        "items": [
            {
                "id": str(paper.id),
                "external_id": paper.external_id,
                "title": _translate_to_turkish(paper.title),
                "authors": paper.authors,
                "abstract": paper.abstract,
                "published_at": paper.published_at,
                "url": paper.url,
                "categories": paper.categories,
            }
            for paper in papers
        ]
    }


@router.get("/technology", tags=["technology"])
def technology_radar(session: DatabaseSession) -> dict[str, Any]:
    signals = session.scalars(
        select(TechnologySignal).order_by(TechnologySignal.last_seen_at.desc())
    ).all()
    return {
        "items": [
            {
                "slug": item.slug,
                "name": item.name,
                "category": item.category,
                "first_seen_at": item.first_seen_at,
                "last_seen_at": item.last_seen_at,
                "strength": item.strength,
                "evidence": item.evidence,
            }
            for item in signals
        ]
    }


@router.get("/rankings/catalog", tags=["rankings"])
def rankings_catalog() -> dict[str, Any]:
    return {
        "categories": RANKING_CATEGORIES,
        "items": ranking_catalog(),
        "scenarios": VALUE_SCENARIOS,
    }


@router.get("/comparisons/value", tags=["rankings"])
def compare_value(
    quality: float | None = None,
    input_price: float | None = None,
    output_price: float | None = None,
    cache: float | None = None,
    speed: float | None = None,
    context: float | None = None,
    scenario: str = "chat",
) -> dict[str, Any]:
    if scenario not in VALUE_SCENARIOS:
        raise HTTPException(status_code=404, detail="Unknown value scenario")
    return value_score(
        quality=quality,
        input_price=input_price,
        output_price=output_price,
        cache=cache,
        speed=speed,
        context=context,
        scenario=scenario,
    )


@router.get("/notifications", tags=["notifications"])
def list_notifications(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict[str, Any]:
    rows = session.scalars(
        select(Notification).order_by(Notification.created_at.desc()).limit(limit)
    ).all()
    items: list[dict[str, Any]] = []
    for row in rows:
        change = session.get(ChangeEvent, row.change_event_id) if row.change_event_id else None
        source = session.get(Source, change.source_id) if change is not None else None
        items.append(
            {
                "id": str(row.id),
                "title": row.title,
                "body": row.body,
                "importance": row.importance,
                "status": row.status,
                "channel": row.channel,
                "source_url": source.url if source is not None else None,
                "created_at": row.created_at,
            }
        )
    return {"items": items}


@router.post("/notifications/{notification_id}/read", tags=["notifications"])
def mark_notification_read(notification_id: UUID, session: DatabaseSession) -> dict[str, str]:
    row = session.get(Notification, notification_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.status = "read"
    session.commit()
    return {"status": "read"}


@router.get("/stream/events", tags=["events"])
async def stream_events(request: Request) -> StreamingResponse:
    async def generate() -> Any:
        last_seen: datetime | None = None
        while True:
            if await request.is_disconnected():
                break
            from llm_radar.database.session import SessionLocal

            with SessionLocal() as session:
                query = select(ChangeEvent).order_by(ChangeEvent.detected_at.desc()).limit(10)
                if last_seen is not None:
                    query = (
                        select(ChangeEvent)
                        .where(ChangeEvent.detected_at > last_seen)
                        .order_by(ChangeEvent.detected_at.asc())
                        .limit(20)
                    )
                rows = session.scalars(query).all()
                event_rows = [(row, session.get(Source, row.source_id)) for row in rows]
            for row, source in event_rows:
                last_seen = (
                    row.detected_at if last_seen is None else max(last_seen, row.detected_at)
                )
                payload = {
                    "id": str(row.id),
                    "event_type": row.event_type,
                    "category": row.category,
                    "title": row.title,
                    "importance": row.importance,
                    "importance_score": row.importance_score,
                    "source_url": source.url if source is not None else None,
                    "detected_at": row.detected_at.isoformat(),
                }
                yield f"id: {row.id}\nevent: change\ndata: {json.dumps(payload)}\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/system/health", tags=["system"])
def system_health(session: DatabaseSession) -> dict[str, Any]:
    return {
        "checked_at": datetime.now(UTC),
        "sources": session.scalar(select(func.count()).select_from(Source)) or 0,
        "change_events": session.scalar(select(func.count()).select_from(ChangeEvent)) or 0,
        "collector_runs": session.scalar(select(func.count()).select_from(CollectorRun)) or 0,
        "dead_letters": session.scalar(
            select(func.count())
            .select_from(DeadLetterEvent)
            .where(DeadLetterEvent.replayed_at.is_(None))
        )
        or 0,
        "last_collector_run": session.scalar(select(func.max(CollectorRun.finished_at))),
    }


@router.post("/admin/aliases", tags=["admin"], dependencies=[Depends(require_admin)])
def create_alias(payload: dict[str, Any], session: DatabaseSession) -> dict[str, str]:
    alias = remember_alias(
        session,
        str(payload["canonical_key"]),
        str(payload["alias_key"]),
        str(payload.get("method") or "manual"),
        approved=bool(payload.get("approved", True)),
    )
    session.commit()
    return {"id": str(alias.id), "canonical_key": alias.canonical_key}


@router.get("/admin/dead-letters", tags=["admin"], dependencies=[Depends(require_admin)])
def list_dead_letters(session: DatabaseSession) -> dict[str, Any]:
    rows = session.scalars(
        select(DeadLetterEvent).order_by(DeadLetterEvent.created_at.desc()).limit(50)
    ).all()
    return {
        "items": [
            {
                "id": str(row.id),
                "topic": row.topic,
                "error": row.error,
                "created_at": row.created_at,
                "replayed_at": row.replayed_at,
            }
            for row in rows
        ]
    }


@router.post("/admin/collectors/{name}/run", tags=["admin"], dependencies=[Depends(require_admin)])
async def run_collector(name: str) -> dict[str, Any]:
    from llm_radar.collectors.framework import collect_once

    mapping = {
        "openrouter": OpenRouterCollector,
        "huggingface": HuggingFaceCollector,
        "github": GitHubCollector,
        "arxiv": ArxivCollector,
    }
    factory = mapping.get(name)
    if factory is None:
        raise HTTPException(status_code=404, detail="Unknown collector")
    published = await collect_once(factory)
    return {"collector": name, "events_published": published}


@router.get("/admin/collector-runs", tags=["admin"], dependencies=[Depends(require_admin)])
def collector_runs(session: DatabaseSession) -> dict[str, Any]:
    rows = session.scalars(
        select(CollectorRun).order_by(CollectorRun.started_at.desc()).limit(50)
    ).all()
    return {
        "items": [
            {
                "id": str(row.id),
                "collector_name": row.collector_name,
                "status": row.status,
                "events_published": row.events_published,
                "error": row.error,
                "started_at": row.started_at,
                "finished_at": row.finished_at,
            }
            for row in rows
        ]
    }
