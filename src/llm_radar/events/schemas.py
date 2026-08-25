from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, HttpUrl


class EventType(StrEnum):
    MODEL_RELEASED = "model.released"
    MODEL_UPDATED = "model.updated"
    MODEL_DEPRECATED = "model.deprecated"
    MODEL_VERSION_CHANGED = "model.version_changed"
    PRICE_CHANGED = "price.changed"
    CACHE_PRICE_CHANGED = "cache_price.changed"
    CONTEXT_CHANGED = "context.changed"
    CAPABILITY_CHANGED = "capability.changed"
    LICENSE_CHANGED = "license.changed"
    WEIGHTS_RELEASED = "weights.released"
    HUGGINGFACE_UPDATED = "huggingface.updated"
    GITHUB_RELEASE_PUBLISHED = "github.release_published"
    BENCHMARK_UPDATED = "benchmark.updated"
    LEADERBOARD_CHANGED = "leaderboard.changed"
    COMPANY_ANNOUNCEMENT = "company.announcement"
    RESEARCH_PUBLISHED = "research.published"
    TECHNOLOGY_DETECTED = "technology.detected"
    MARKET_SHARE_CHANGED = "market_share.changed"


class ReliabilityLevel(StrEnum):
    OFFICIAL_API = "official_api"
    OFFICIAL_DOCUMENT = "official_document"
    INDEPENDENT_MEASUREMENT = "independent_measurement"
    ACADEMIC = "academic"
    THIRD_PARTY = "third_party"
    COMMUNITY = "community"
    UNVERIFIED = "unverified"


class Importance(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class VerificationStatus(StrEnum):
    UNVERIFIED = "unverified"
    SOURCE_ASSERTED = "source_asserted"
    CORROBORATED = "corroborated"
    OFFICIAL = "official"
    REJECTED = "rejected"


class EventMetadata(BaseModel):
    source_url: HttpUrl
    reliability: ReliabilityLevel
    trace_id: UUID = Field(default_factory=uuid4)
    correlation_id: UUID | None = None
    extraction_method: str = "parser"
    content_hash: str | None = None
    raw_object_key: str | None = None
    verification_status: VerificationStatus = VerificationStatus.SOURCE_ASSERTED


class EventEnvelope(BaseModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: EventType
    schema_version: int = Field(default=1, ge=1)
    source: str = Field(min_length=1)
    entity_key: str = Field(min_length=1)
    occurred_at: datetime
    collected_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any]
    metadata: EventMetadata
    importance: Importance = Importance.INFO
