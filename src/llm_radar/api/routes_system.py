"""System-status endpoints: catalog stats, source health."""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select

from llm_radar.api.deps import DatabaseSession
from llm_radar.config import get_settings, source_is_configured
from llm_radar.database.models import (
    ChangeEvent,
    Company,
    Model,
    ModelSnapshot,
    PriceObservation,
    Source,
)

router = APIRouter(prefix="/api/v1")


@router.get("/stats", tags=["stats"])
def stats(session: DatabaseSession) -> dict[str, int]:
    return {
        "companies": session.scalar(select(func.count()).select_from(Company)) or 0,
        "models": session.scalar(select(func.count()).select_from(Model)) or 0,
        "snapshots": session.scalar(select(func.count()).select_from(ModelSnapshot)) or 0,
        "price_observations": session.scalar(select(func.count()).select_from(PriceObservation))
        or 0,
        "change_events": session.scalar(select(func.count()).select_from(ChangeEvent)) or 0,
    }


@router.get("/sources/health", tags=["sources"])
def source_health(session: DatabaseSession) -> dict[str, Any]:
    stale_after = timedelta(hours=get_settings().source_stale_after_hours)
    now = datetime.now(UTC)
    sources = session.scalars(select(Source).order_by(Source.name)).all()
    items = []
    for source in sources:
        configured = source.is_active and source_is_configured(source.slug or source.name)
        stale = configured and (
            source.last_success_at is None or now - source.last_success_at > stale_after
        )
        status = source.status
        if not source.is_active:
            status = "disabled"
        elif not configured:
            status = "not_configured"
        elif stale and source.status == "active":
            status = "stale"
        items.append(
            {
                "name": source.name,
                "url": source.url,
                "status": status,
                "last_checked_at": source.last_checked_at,
                "last_success_at": source.last_success_at,
                "has_error": source.last_error is not None,
                "consecutive_failures": source.consecutive_failures,
                "stale": stale,
                "configured": configured,
            }
        )
    return {"checked_at": now, "items": items}
