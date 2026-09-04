from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Company(TimestampMixin, Base):
    __tablename__ = "companies"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    website_url: Mapped[str | None] = mapped_column(Text)
    models: Mapped[list["Model"]] = relationship(back_populates="company")
    families: Mapped[list["ModelFamily"]] = relationship(back_populates="company")


class ModelFamily(TimestampMixin, Base):
    __tablename__ = "model_families"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    company: Mapped[Company] = relationship(back_populates="families")


class Source(TimestampMixin, Base):
    __tablename__ = "sources"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, default="")
    url: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(40))
    category: Mapped[str] = mapped_column(String(40), default="market")
    source_class: Mapped[str] = mapped_column(String(40), default="independent")
    collection_method: Mapped[str] = mapped_column(String(40), default="rest")
    reliability_level: Mapped[str] = mapped_column(String(40))
    check_interval_seconds: Mapped[int] = mapped_column(Integer, default=21600)
    rate_limit_per_minute: Mapped[int | None] = mapped_column(Integer)
    auth_type: Mapped[str] = mapped_column(String(40), default="none")
    terms_url: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    etag: Mapped[str | None] = mapped_column(String(240))
    last_modified: Mapped[str | None] = mapped_column(String(240))
    status: Mapped[str] = mapped_column(String(20), default="active")
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    consecutive_failures: Mapped[int] = mapped_column(default=0)


class Provider(TimestampMixin, Base):
    __tablename__ = "providers"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    website_url: Mapped[str | None] = mapped_column(Text)


class Model(TimestampMixin, Base):
    __tablename__ = "models"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    family_id: Mapped[UUID | None] = mapped_column(ForeignKey("model_families.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True)
    family: Mapped[str | None] = mapped_column(String(120))
    version: Mapped[str | None] = mapped_column(String(100))
    release_date: Mapped[date | None] = mapped_column(Date)
    is_open_weight: Mapped[bool | None] = mapped_column(Boolean)
    license: Mapped[str | None] = mapped_column(String(120))
    context_window: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(40), default="active")
    parameter_count: Mapped[int | None] = mapped_column(BigInteger)
    active_parameter_count: Mapped[int | None] = mapped_column(BigInteger)
    capabilities: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    company: Mapped[Company] = relationship(back_populates="models")
    snapshots: Mapped[list["ModelSnapshot"]] = relationship(back_populates="model")
    profile: Mapped["ModelProfile | None"] = relationship(
        back_populates="model", cascade="all, delete-orphan", uselist=False
    )


class ModelProfile(TimestampMixin, Base):
    """Canonical, query-optimized model features derived from source observations."""

    __tablename__ = "model_profiles"

    model_id: Mapped[UUID] = mapped_column(
        ForeignKey("models.id", ondelete="CASCADE"), primary_key=True
    )
    context_window: Mapped[int | None] = mapped_column(Integer, index=True)
    max_output_tokens: Mapped[int | None] = mapped_column(Integer)
    input_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), index=True)
    output_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), index=True)
    cache_read_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    modalities: Mapped[list[str]] = mapped_column(JSONB, default=list)
    capabilities: Mapped[list[str]] = mapped_column(JSONB, default=list)
    supports_tool_calling: Mapped[bool | None] = mapped_column(Boolean, index=True)
    supports_structured_output: Mapped[bool | None] = mapped_column(Boolean)
    supports_reasoning: Mapped[bool | None] = mapped_column(Boolean, index=True)
    supports_streaming: Mapped[bool | None] = mapped_column(Boolean)
    availability: Mapped[str | None] = mapped_column(String(32), index=True)
    openness: Mapped[str | None] = mapped_column(String(32), index=True)
    license: Mapped[str | None] = mapped_column(String(120), index=True)
    commercial_use_allowed: Mapped[bool | None] = mapped_column(Boolean)
    commercial_use_status: Mapped[str | None] = mapped_column(String(32), index=True)
    field_provenance: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    # Read-model fields maintained by llm_radar.read_model.refresh_read_model:
    # denormalized so leaderboard/openness filters sort and paginate in SQL.
    general_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), index=True)
    effective_openness: Mapped[str | None] = mapped_column(String(32), index=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    model: Mapped[Model] = relationship(back_populates="profile")


class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"
    __table_args__ = (UniqueConstraint("model_id", "version", name="uq_model_version"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    model_id: Mapped[UUID] = mapped_column(ForeignKey("models.id"), index=True)
    version: Mapped[str] = mapped_column(String(120))
    released_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


class ProviderEndpoint(TimestampMixin, Base):
    __tablename__ = "provider_endpoints"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    provider_id: Mapped[UUID] = mapped_column(ForeignKey("providers.id"), index=True)
    model_id: Mapped[UUID] = mapped_column(ForeignKey("models.id"), index=True)
    api_id: Mapped[str] = mapped_column(String(240))
    status: Mapped[str] = mapped_column(String(40), default="active")


class ModelSnapshot(Base):
    __tablename__ = "model_snapshots"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    model_id: Mapped[UUID] = mapped_column(ForeignKey("models.id"), index=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    model: Mapped[Model] = relationship(back_populates="snapshots")


class PriceObservation(Base):
    __tablename__ = "price_observations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    model_id: Mapped[UUID] = mapped_column(ForeignKey("models.id"), index=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    provider: Mapped[str] = mapped_column(String(120))
    input_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    output_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    cache_read_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    cache_write_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    unit: Mapped[str] = mapped_column(String(40), default="per_1m_tokens")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class SourceDocument(Base):
    __tablename__ = "source_documents"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    url: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    object_key: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(80), default="application/json")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class FieldObservation(Base):
    __tablename__ = "field_observations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    field_name: Mapped[str] = mapped_column(String(80), index=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    document_id: Mapped[UUID | None] = mapped_column(ForeignKey("source_documents.id"))
    reliability: Mapped[str] = mapped_column(String(40))
    verification_status: Mapped[str] = mapped_column(String(40), default="source_asserted")
    extraction_method: Mapped[str] = mapped_column(String(40), default="parser")
    previous_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    field_name: Mapped[str] = mapped_column(String(80), index=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    document_id: Mapped[UUID | None] = mapped_column(ForeignKey("source_documents.id"))
    asserted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reliability: Mapped[str] = mapped_column(String(40))
    verification_status: Mapped[str] = mapped_column(String(40), default="source_asserted")
    extraction_method: Mapped[str] = mapped_column(String(40), default="parser")
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class BenchmarkDefinition(TimestampMixin, Base):
    __tablename__ = "benchmark_definitions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(80), index=True)
    methodology_url: Mapped[str] = mapped_column(Text)


class LeaderboardSnapshot(Base):
    __tablename__ = "leaderboard_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "benchmark_id",
            "model_external_id",
            "category",
            "published_at",
            name="uq_leaderboard_snapshot_identity",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    benchmark_id: Mapped[UUID] = mapped_column(ForeignKey("benchmark_definitions.id"), index=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    model_external_id: Mapped[str] = mapped_column(String(240), index=True)
    organization: Mapped[str] = mapped_column(String(160), index=True)
    license: Mapped[str | None] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(80), index=True)
    rank: Mapped[int] = mapped_column(index=True)
    score: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    score_lower: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    score_upper: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    vote_count: Mapped[int | None]
    published_at: Mapped[date] = mapped_column(Date, index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSONB)


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    benchmark_id: Mapped[UUID] = mapped_column(ForeignKey("benchmark_definitions.id"), index=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    model_external_id: Mapped[str] = mapped_column(String(240), index=True)
    model_version: Mapped[str | None] = mapped_column(String(120))
    score: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    score_type: Mapped[str] = mapped_column(String(80))
    tested_at: Mapped[date | None] = mapped_column(Date)
    prompt_method: Mapped[str | None] = mapped_column(String(160))
    temperature: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    token_budget: Mapped[int | None]
    pass_count: Mapped[int | None]
    agent_harness: Mapped[str | None] = mapped_column(String(160))
    tools: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    environment: Mapped[str | None] = mapped_column(String(160))
    measured_by: Mapped[str] = mapped_column(String(160))
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    source_url: Mapped[str] = mapped_column(Text)
    verification_status: Mapped[str] = mapped_column(String(40), default="source_asserted")
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ChangeEvent(Base):
    __tablename__ = "change_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    category: Mapped[str] = mapped_column(String(40), default="model_update", index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str | None] = mapped_column(Text)
    old_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    new_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    change_percentage: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    absolute_change: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    importance: Mapped[str] = mapped_column(String(20), default="info")
    importance_score: Mapped[int] = mapped_column(Integer, default=0, index=True)
    importance_factors: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    confidence: Mapped[str] = mapped_column(String(20), default="source_asserted")
    verification_status: Mapped[str] = mapped_column(String(40), default="source_asserted")
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class ProcessedEvent(Base):
    __tablename__ = "processed_events"

    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    source: Mapped[str] = mapped_column(String(160), index=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    topic: Mapped[str] = mapped_column(String(160), index=True)
    event_key: Mapped[str] = mapped_column(String(240))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    last_error: Mapped[str | None] = mapped_column(Text)


class EntityAlias(TimestampMixin, Base):
    __tablename__ = "entity_aliases"
    __table_args__ = (UniqueConstraint("alias_key", name="uq_entity_alias_key"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    canonical_key: Mapped[str] = mapped_column(String(240), index=True)
    alias_key: Mapped[str] = mapped_column(String(240))
    method: Mapped[str] = mapped_column(String(40))
    confidence: Mapped[str] = mapped_column(String(20), default="exact")
    approved: Mapped[bool] = mapped_column(Boolean, default=True)


class DedupRecord(Base):
    __tablename__ = "dedup_records"
    __table_args__ = (UniqueConstraint("kind", "value", name="uq_dedup_kind_value"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    kind: Mapped[str] = mapped_column(String(40))
    value: Mapped[str] = mapped_column(String(128), index=True)
    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResearchPaper(Base):
    __tablename__ = "research_papers"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    external_id: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500))
    authors: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    abstract: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[date | None] = mapped_column(Date, index=True)
    url: Mapped[str] = mapped_column(Text)
    categories: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class TechnologySignal(Base):
    __tablename__ = "technology_signals"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80), index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    strength: Mapped[str] = mapped_column(String(20), default="medium")


class MarketObservation(Base):
    __tablename__ = "market_observations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    entity_key: Mapped[str] = mapped_column(String(240), index=True)
    metric: Mapped[str] = mapped_column(String(80), index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(18, 8))
    unit: Mapped[str] = mapped_column(String(40))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id"), index=True)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(240), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(160))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)


class NotificationRule(TimestampMixin, Base):
    __tablename__ = "notification_rules"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    companies: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    models: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    event_types: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    min_importance: Mapped[str] = mapped_column(String(20), default="medium")
    min_change_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    channels: Mapped[list[Any]] = mapped_column(JSONB, default=lambda: ["in_app"])
    digest: Mapped[str] = mapped_column(String(20), default="instant")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    change_event_id: Mapped[UUID | None] = mapped_column(ForeignKey("change_events.id"), index=True)
    channel: Mapped[str] = mapped_column(String(40), default="in_app")
    status: Mapped[str] = mapped_column(String(20), default="unread", index=True)
    title: Mapped[str] = mapped_column(String(240))
    body: Mapped[str] = mapped_column(Text)
    importance: Mapped[str] = mapped_column(String(20), default="info")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CollectorRun(Base):
    __tablename__ = "collector_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    collector_name: Mapped[str] = mapped_column(String(80), index=True)
    source_id: Mapped[UUID | None] = mapped_column(ForeignKey("sources.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    events_published: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    raw_object_key: Mapped[str | None] = mapped_column(Text)


class DeadLetterEvent(Base):
    __tablename__ = "dead_letter_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    topic: Mapped[str] = mapped_column(String(120))
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    replayed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AnalyticsEvent(Base):
    """Privacy-minimal product analytics linked only by an anonymous session UUID."""

    __tablename__ = "analytics_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    session_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    model_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("models.id", ondelete="SET NULL"), index=True
    )
    related_model_ids: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    sort: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    page: Mapped[str] = mapped_column(String(120), default="/")
    event_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    feedback_type: Mapped[str] = mapped_column(String(40), index=True)
    message: Mapped[str] = mapped_column(Text)

    related_model_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )
    subject: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    product_area: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    submission_context: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    status: Mapped[str] = mapped_column(String(24), default="new", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class ModelDemand(Base):
    __tablename__ = "model_demands"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)

    requested_models: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    requested_model_ids: Mapped[list[Any]] = mapped_column(JSONB, default=list)

    other_model: Mapped[str | None] = mapped_column(String(200), nullable=True)

    use_cases: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    criteria: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    demand_level: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    usage_volume: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    budget_range: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    deployment_preference: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    timeline: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)

    user_type: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    full_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    organization_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    submission_context: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="new", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
