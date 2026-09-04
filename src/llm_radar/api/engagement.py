from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.database.models import AnalyticsEvent, Company, Feedback, Model, ModelDemand
from llm_radar.database.session import get_db
from llm_radar.storage import rate_limit_exceeded

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]


def _client_ip(request: Request) -> str:
    # Behind the deployed reverse proxy the first X-Forwarded-For hop is the
    # real client; direct exposure would let a caller spoof it, so the proxy
    # must overwrite this header (standard ingress behaviour).
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimit:
    """Per-IP fixed-window guard for unauthenticated write endpoints."""

    def __init__(self, name: str, limit: int, window_seconds: int) -> None:
        self.name = name
        self.limit = limit
        self.window_seconds = window_seconds

    def __call__(self, request: Request) -> None:
        bucket = f"{self.name}:{_client_ip(request)}"
        if rate_limit_exceeded(bucket, self.limit, self.window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests, please slow down.",
            )

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
    "missing_model",
    "data_error",
    "pricing_error",
    "benchmark_error",
    "source_suggestion",
    "filter_suggestion",
    "feature_request",
    "ux_feedback",
    "bug_report",
    "general",
]

FeedbackSeverity = Literal[
    "low",
    "medium",
    "high",
    "critical",
]

DemandUseCase = Literal[
    "chat",
    "rag",
    "coding",
    "agent",
    "multimodal",
    "enterprise",
    "other",
]

DemandCriterion = Literal[
    "performance",
    "price",
    "speed",
    "turkish",
    "privacy",
    "open_weight",
    "data_residency",
    "openai_compatible",
    "fine_tuning",
]

DemandLevel = Literal[
    "interested",
    "need",
    "active_use",
]

DemandUsageVolume = Literal[
    "pilot",
    "under_10m",
    "under_100m",
    "over_100m",
]

DemandBudgetRange = Literal[
    "unknown",
    "under_100",
    "100_500",
    "500_2000",
    "over_2000",
]

DemandDeploymentPreference = Literal[
    "no_preference",
    "turkey",
    "private_cloud",
    "on_premise",
]

DemandTimeline = Literal[
    "exploring",
    "this_quarter",
    "immediate",
]

DemandUserType = Literal[
    "developer",
    "startup",
    "enterprise",
    "organization",
    "individual",
]


class SubmissionContext(BaseModel):
    page: str | None = Field(default=None, max_length=240)
    section: str | None = Field(default=None, max_length=80)
    locale: str | None = Field(default=None, max_length=32)
    viewport: str | None = Field(default=None, max_length=32)

    @field_validator("page", "section", "locale", "viewport")
    @classmethod
    def clean_optional_context(cls, value: str | None) -> str | None:
        cleaned = value.strip() if value else None
        return cleaned or None


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

    related_model_id: UUID | None = None
    subject: str | None = Field(default=None, max_length=60)
    severity: FeedbackSeverity | None = None
    source_url: str | None = Field(default=None, max_length=500)
    product_area: str | None = Field(default=None, max_length=80)
    context: SubmissionContext | None = None

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return value.strip()

    @field_validator("subject", "source_url", "product_area")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        cleaned = value.strip() if value else None
        return cleaned or None


class ModelDemandRequest(BaseModel):
    submission_id: UUID = Field(default_factory=uuid4)
    session_id: UUID

    # Mevcut summary sistemiyle geriye uyumluluk için isim snapshot'ı.
    requested_models: list[str] = Field(default_factory=list, max_length=20)

    # Canonical model kimlikleri.
    requested_model_ids: list[UUID] = Field(default_factory=list, max_length=20)

    other_model: str | None = Field(default=None, max_length=200)

    use_cases: list[DemandUseCase] = Field(default_factory=list, max_length=10)
    criteria: list[DemandCriterion] = Field(default_factory=list, max_length=10)
    demand_level: DemandLevel | None = None
    usage_volume: DemandUsageVolume | None = None
    budget_range: DemandBudgetRange | None = None
    deployment_preference: DemandDeploymentPreference | None = None
    timeline: DemandTimeline | None = None

    user_type: list[DemandUserType] = Field(default_factory=list, max_length=5)
    full_name: str | None = Field(default=None, max_length=160)
    organization_name: str | None = Field(default=None, max_length=160)
    user_note: str | None = Field(default=None, max_length=2000)

    context: SubmissionContext | None = None

    @field_validator("user_type")
    @classmethod
    def normalize_user_type(cls, values: list[Any]) -> list[Any]:
        return list(dict.fromkeys(values))

    @field_validator("full_name", "organization_name", "user_note")
    @classmethod
    def clean_optional_profile_text(cls, value: str | None) -> str | None:
        cleaned = value.strip() if value else None
        return cleaned or None

    @field_validator("requested_models")
    @classmethod
    def normalize_models(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))

    @field_validator("requested_model_ids")
    @classmethod
    def normalize_model_ids(cls, values: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(values))

    @field_validator("use_cases", "criteria")
    @classmethod
    def normalize_choices(cls, values: list[Any]) -> list[Any]:
        return list(dict.fromkeys(values))

    @field_validator("other_model")
    @classmethod
    def clean_other(cls, value: str | None) -> str | None:
        cleaned = value.strip() if value else None
        return cleaned or None


@router.post(
    "/analytics/events",
    tags=["analytics"],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimit("analytics", limit=180, window_seconds=60))],
)
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


@router.post(
    "/feedback",
    tags=["feedback"],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimit("feedback", limit=12, window_seconds=60))],
)
def submit_feedback(request: FeedbackRequest, session: DatabaseSession) -> dict[str, Any]:
    existing = session.get(Feedback, request.submission_id)
    if existing is not None:
        return {
            "accepted": False,
            "duplicate": True,
            "feedback_id": str(existing.id),
            "tracking_code": str(existing.id),
            "status": existing.status,
        }

    if (
        request.related_model_id is not None
        and session.get(Model, request.related_model_id) is None
    ):
        raise HTTPException(status_code=404, detail="Related model not found")

    item = Feedback(
        id=request.submission_id,
        session_id=request.session_id,
        feedback_type=request.feedback_type,
        message=request.message,
        related_model_id=request.related_model_id,
        subject=request.subject,
        severity=request.severity,
        source_url=request.source_url,
        product_area=request.product_area,
        submission_context=(
            request.context.model_dump(exclude_none=True) if request.context else {}
        ),
        status="new",
    )

    session.add(item)
    session.commit()

    return {
        "accepted": True,
        "duplicate": False,
        "feedback_id": str(item.id),
        "tracking_code": str(item.id),
        "status": item.status,
    }


@router.post(
    "/model-demands",
    tags=["feedback"],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimit("model-demands", limit=8, window_seconds=60))],
)
def submit_model_demand(request: ModelDemandRequest, session: DatabaseSession) -> dict[str, Any]:
    if not request.requested_model_ids and not request.requested_models and not request.other_model:
        raise HTTPException(
            status_code=422,
            detail="Select or enter at least one model",
        )

    existing = session.get(ModelDemand, request.submission_id)
    if existing is not None:
        return {
            "accepted": False,
            "duplicate": True,
            "demand_id": str(existing.id),
            "tracking_code": str(existing.id),
            "status": existing.status,
        }

    requested_models = request.requested_models
    requested_model_ids = request.requested_model_ids

    if requested_model_ids:
        found_models = session.scalars(select(Model).where(Model.id.in_(requested_model_ids))).all()

        models_by_id = {model.id: model for model in found_models}

        missing_ids = [model_id for model_id in requested_model_ids if model_id not in models_by_id]

        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail="One or more requested models were not found",
            )

        # İsimleri frontend'den değil canonical Model kayıtlarından üret.
        requested_models = [models_by_id[model_id].name for model_id in requested_model_ids]

    item = ModelDemand(
        id=request.submission_id,
        session_id=request.session_id,
        requested_models=requested_models,
        requested_model_ids=[str(model_id) for model_id in requested_model_ids],
        other_model=request.other_model,
        use_cases=request.use_cases,
        criteria=request.criteria,
        demand_level=request.demand_level,
        usage_volume=request.usage_volume,
        budget_range=request.budget_range,
        deployment_preference=request.deployment_preference,
        timeline=request.timeline,
        user_type=request.user_type,
        full_name=request.full_name,
        organization_name=request.organization_name,
        user_note=request.user_note,
        submission_context=(
            request.context.model_dump(exclude_none=True) if request.context else {}
        ),
        status="new",
    )

    session.add(item)
    session.commit()

    return {
        "accepted": True,
        "duplicate": False,
        "demand_id": str(item.id),
        "tracking_code": str(item.id),
        "status": item.status,
    }


@router.get("/feedback/{submission_id}/status", tags=["feedback"])
def feedback_status(
    submission_id: UUID,
    session_id: UUID,
    session: DatabaseSession,
) -> dict[str, Any]:
    item = session.get(Feedback, submission_id)
    if item is None or item.session_id != session_id:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {
        "tracking_code": str(item.id),
        "type": "feedback",
        "status": item.status,
        "created_at": item.created_at,
    }


@router.get("/model-demands/{submission_id}/status", tags=["feedback"])
def model_demand_status(
    submission_id: UUID,
    session_id: UUID,
    session: DatabaseSession,
) -> dict[str, Any]:
    item = session.get(ModelDemand, submission_id)
    if item is None or item.session_id != session_id:
        raise HTTPException(status_code=404, detail="Model demand not found")
    return {
        "tracking_code": str(item.id),
        "type": "model_demand",
        "status": item.status,
        "created_at": item.created_at,
    }


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


@router.get("/analytics/spotlight", tags=["analytics"])
def model_spotlight(
    session: DatabaseSession,
    period: Literal["week", "month", "year"] = "week",
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
) -> dict[str, Any]:
    days = {"week": 7, "month": 30, "year": 365}[period]
    since = datetime.now(UTC) - timedelta(days=days)
    viewed = _model_counts(session, "model_viewed", since)
    compared = _model_counts(session, "model_compared", since)
    combined: dict[UUID, int] = {}
    for model_id, count in viewed.items():
        combined[model_id] = combined.get(model_id, 0) + count * 2
    for model_id, count in compared.items():
        combined[model_id] = combined.get(model_id, 0) + count * 3
    labels = {
        "week": "Haftanın modeli",
        "month": "Ayın modeli",
        "year": "Yılın modeli",
    }
    return {
        "period": period,
        "window_days": days,
        "label": labels[period],
        "metric_note": "Görüntüleme ve karşılaştırma etkileşimlerinin ağırlıklı toplamıdır.",
        "items": _serialize_ranked_models(session, combined, limit),
    }


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
