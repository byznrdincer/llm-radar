from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.database.models import AnalyticsEvent, Company, Feedback, Model, ModelDemand
from llm_radar.database.session import get_db

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]

AnalyticsEventType = Literal[
    "model_viewed",
    "model_compared",
    "filter_applied",
    "sort_changed",
    "search_performed",
    "feedback_submitted",
    "model_requested",
]
FeedbackType = Literal[
    "missing_model", "filter_suggestion", "bug_report", "feature_request", "general"
]


class AnalyticsEventRequest(BaseModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: AnalyticsEventType
    session_id: UUID
    model_id: UUID | None = None
    related_model_ids: list[UUID] = Field(default_factory=list, max_length=3)
    filters: dict[str, Any] = Field(default_factory=dict)
    sort: dict[str, Any] = Field(default_factory=dict)
    page: str = Field(default="/", max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FeedbackRequest(BaseModel):
    submission_id: UUID = Field(default_factory=uuid4)
    session_id: UUID | None = None
    feedback_type: FeedbackType
    message: str = Field(min_length=3, max_length=4000)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return value.strip()


class ModelDemandRequest(BaseModel):
    submission_id: UUID = Field(default_factory=uuid4)
    session_id: UUID
    requested_models: list[str] = Field(default_factory=list, max_length=20)
    other_model: str | None = Field(default=None, max_length=200)

    @field_validator("requested_models")
    @classmethod
    def normalize_models(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))

    @field_validator("other_model")
    @classmethod
    def clean_other(cls, value: str | None) -> str | None:
        cleaned = value.strip() if value else None
        return cleaned or None


@router.post("/analytics/events", tags=["analytics"], status_code=status.HTTP_201_CREATED)
def record_analytics_event(
    request: AnalyticsEventRequest, session: DatabaseSession
) -> dict[str, Any]:
    """Store a deduplicated anonymous session event without IP or user-agent data."""
    existing = session.get(AnalyticsEvent, request.event_id)
    if existing is not None:
        return {"accepted": False, "duplicate": True, "event_id": str(existing.id)}
    if request.model_id is not None and session.get(Model, request.model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")
    event = AnalyticsEvent(
        id=request.event_id,
        event_type=request.event_type,
        session_id=request.session_id,
        model_id=request.model_id,
        related_model_ids=[str(item) for item in request.related_model_ids],
        filters=request.filters,
        sort=request.sort,
        page=request.page,
        event_metadata=request.metadata,
    )
    session.add(event)
    session.commit()
    return {"accepted": True, "duplicate": False, "event_id": str(event.id)}


@router.post("/feedback", tags=["feedback"], status_code=status.HTTP_201_CREATED)
def submit_feedback(request: FeedbackRequest, session: DatabaseSession) -> dict[str, Any]:
    existing = session.get(Feedback, request.submission_id)
    if existing is not None:
        return {"accepted": False, "duplicate": True, "feedback_id": str(existing.id)}
    item = Feedback(
        id=request.submission_id,
        session_id=request.session_id,
        feedback_type=request.feedback_type,
        message=request.message,
        status="new",
    )
    session.add(item)
    session.commit()
    return {"accepted": True, "duplicate": False, "feedback_id": str(item.id)}


@router.post("/model-demands", tags=["feedback"], status_code=status.HTTP_201_CREATED)
def submit_model_demand(request: ModelDemandRequest, session: DatabaseSession) -> dict[str, Any]:
    if not request.requested_models and not request.other_model:
        raise HTTPException(status_code=422, detail="Select or enter at least one model")
    existing = session.get(ModelDemand, request.submission_id)
    if existing is not None:
        return {"accepted": False, "duplicate": True, "demand_id": str(existing.id)}
    item = ModelDemand(
        id=request.submission_id,
        session_id=request.session_id,
        requested_models=request.requested_models,
        other_model=request.other_model,
    )
    session.add(item)
    session.commit()
    return {"accepted": True, "duplicate": False, "demand_id": str(item.id)}


def _model_counts(
    session: Session, event_type: str, since: datetime, until: datetime | None = None
) -> dict[UUID, int]:
    conditions = [
        AnalyticsEvent.event_type == event_type,
        AnalyticsEvent.model_id.is_not(None),
        AnalyticsEvent.created_at >= since,
    ]
    if until is not None:
        conditions.append(AnalyticsEvent.created_at < until)
    return {
        model_id: count
        for model_id, count in session.execute(
            select(AnalyticsEvent.model_id, func.count(AnalyticsEvent.id))
            .where(*conditions)
            .group_by(AnalyticsEvent.model_id)
        )
        if model_id is not None
    }


def _serialize_ranked_models(
    session: Session, counts: dict[UUID, int], limit: int
) -> list[dict[str, Any]]:
    if not counts:
        return []
    models = {
        model.id: (model, company)
        for model, company in session.execute(
            select(Model, Company)
            .join(Company, Company.id == Model.company_id)
            .where(Model.id.in_(counts))
        )
    }
    ranked = sorted(counts.items(), key=lambda item: (-item[1], str(item[0])))[:limit]
    return [
        {
            "model_id": str(model_id),
            "name": models[model_id][0].name,
            "company": models[model_id][1].name,
            "count": count,
        }
        for model_id, count in ranked
        if model_id in models
    ]


def _demand_counts(session: Session, since: datetime) -> dict[str, int]:
    counts: dict[str, int] = {}
    rows = session.scalars(select(ModelDemand).where(ModelDemand.created_at >= since)).all()
    for row in rows:
        for name in row.requested_models:
            clean_name = str(name).strip()
            if clean_name:
                counts[clean_name] = counts.get(clean_name, 0) + 1
        if row.other_model:
            counts[row.other_model] = counts.get(row.other_model, 0) + 1
    return counts


@router.get("/analytics/popular", tags=["analytics"])
def popular_models(
    session: DatabaseSession,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    limit: Annotated[int, Query(ge=1, le=25)] = 8,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    since = now - timedelta(days=days)
    viewed = _model_counts(session, "model_viewed", since)
    compared = _model_counts(session, "model_compared", since)
    recent_since = now - timedelta(days=7)
    previous_since = recent_since - timedelta(days=7)
    recent = _model_counts(session, "model_viewed", recent_since)
    previous_total = _model_counts(session, "model_viewed", previous_since, recent_since)
    rising = {
        model_id: count - previous_total.get(model_id, 0)
        for model_id, count in recent.items()
        if count - previous_total.get(model_id, 0) > 0
    }
    demand = _demand_counts(session, since)
    return {
        "window_days": days,
        "metric_note": (
            "Kullanıcı ilgisini gösterir; model kalitesi veya benchmark liderliği değildir."
        ),
        "most_viewed": _serialize_ranked_models(session, viewed, limit),
        "most_compared": _serialize_ranked_models(session, compared, limit),
        "rising": _serialize_ranked_models(session, rising, limit),
        "most_requested": [
            {"name": name, "count": count}
            for name, count in sorted(demand.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ],
    }


@router.get("/model-demands/summary", tags=["feedback"])
def model_demand_summary(
    session: DatabaseSession,
    days: Annotated[int, Query(ge=1, le=3650)] = 365,
) -> dict[str, Any]:
    counts = _demand_counts(session, datetime.now(UTC) - timedelta(days=days))
    return {
        "window_days": days,
        "items": [
            {"name": name, "count": count}
            for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ],
    }
