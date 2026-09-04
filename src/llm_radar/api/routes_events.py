"""The developments/change-event feed endpoint."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import and_, case, func, or_, select

from llm_radar.api.deps import DatabaseSession
from llm_radar.database.models import (
    ChangeEvent,
    ModelProfile,
)
from llm_radar.event_intelligence import EVENT_CATEGORIES
from llm_radar.model_selection import (
    advancedness_tier_for_score,
)

router = APIRouter(prefix="/api/v1")


@router.get("/events", tags=["events"])
def list_events(
    session: DatabaseSession,
    event_type: str | None = None,
    category: str | None = None,
    search: Annotated[str | None, Query(max_length=160)] = None,
    importance: Literal["critical", "high", "medium", "low", "info"] | None = None,
    since: datetime | None = None,
    min_score: Annotated[int | None, Query(ge=0, le=100)] = None,
    openness: Literal["open_source", "open_weight", "proprietary"] | None = None,
    model_level: Literal["frontier", "advanced", "mid"] | None = None,
    sort_by: Literal["priority", "importance", "recent"] = "importance",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    filters: list[Any] = []
    if event_type:
        filters.append(ChangeEvent.event_type == event_type)
    if category:
        if category not in EVENT_CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown event category")
        filters.append(ChangeEvent.category == category)
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(ChangeEvent.title.ilike(term), ChangeEvent.description.ilike(term)))
    if importance:
        filters.append(ChangeEvent.importance == importance)
    if since is not None:
        filters.append(ChangeEvent.detected_at >= since)
    if min_score is not None:
        filters.append(ChangeEvent.importance_score >= min_score)
    # ChangeEvent.id is the final key everywhere so paging is deterministic
    # across requests when the leading keys tie.
    ordering = (
        (ChangeEvent.importance_score.desc(), ChangeEvent.detected_at.desc(), ChangeEvent.id)
        if sort_by == "importance"
        else (ChangeEvent.detected_at.desc(), ChangeEvent.id)
    )

    # model_openness / model_level belong to the model an event is about; they
    # are denormalized onto model_profiles by llm_radar.read_model. LEFT JOIN so
    # non-model events still flow through, and filter / sort / paginate in SQL
    # rather than materializing every candidate in memory.
    score = ModelProfile.general_score
    query = (
        select(ChangeEvent, ModelProfile.effective_openness, score)
        .outerjoin(
            ModelProfile,
            and_(
                ChangeEvent.entity_type == "model",
                ModelProfile.model_id == ChangeEvent.entity_id,
            ),
        )
        .where(*filters)
    )
    if openness is not None:
        query = query.where(
            ChangeEvent.entity_type == "model", ModelProfile.effective_openness == openness
        )
    if model_level is not None:
        lower, upper = {
            "mid": (Decimal(40), Decimal(70)),
            "advanced": (Decimal(70), Decimal(85)),
            "frontier": (Decimal(85), Decimal("100.1")),
        }[model_level]
        query = query.where(
            ChangeEvent.entity_type == "model", score >= lower, score < upper
        )

    if sort_by == "priority":
        # Urgent news (critical/high) always outranks model level, so a critical
        # security or regulation item is never buried under a routine
        # frontier-model event. Within each urgency band, prefer higher model
        # levels, then the importance score, then recency.
        urgent_rank = case((ChangeEvent.importance.in_(("critical", "high")), 0), else_=1)
        level_rank = case(
            (score.is_(None), 4),
            (score >= 85, 0),
            (score >= 70, 1),
            (score >= 40, 2),
            else_=3,
        )
        order_by: tuple[Any, ...] = (
            urgent_rank,
            level_rank,
            ChangeEvent.importance_score.desc(),
            ChangeEvent.detected_at.desc(),
            ChangeEvent.id,
        )
    else:
        order_by = ordering

    total = (
        session.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    )
    rows = session.execute(query.order_by(*order_by).limit(limit).offset(offset)).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "category": event.category,
                "entity_type": event.entity_type,
                "entity_id": str(event.entity_id),
                "title": event.title,
                "old_value": event.old_value,
                "new_value": event.new_value,
                "change_percentage": (
                    str(event.change_percentage) if event.change_percentage is not None else None
                ),
                "importance": event.importance,
                "importance_score": event.importance_score,
                "importance_factors": event.importance_factors,
                "model_openness": effective_openness,
                "model_level": advancedness_tier_for_score(
                    float(general_score) if general_score is not None else None
                ),
                "evidence": event.evidence,
                "verification_status": event.verification_status,
                "detected_at": event.detected_at,
            }
            for event, effective_openness, general_score in rows
        ],
    }
