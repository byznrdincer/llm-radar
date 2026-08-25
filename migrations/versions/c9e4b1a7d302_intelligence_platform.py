"""intelligence platform schema

Revision ID: c9e4b1a7d302
Revises: a1f8e2d9c401
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c9e4b1a7d302"
down_revision: str | None = "a1f8e2d9c401"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sources", sa.Column("slug", sa.String(length=160), nullable=True))
    op.execute("UPDATE sources SET slug = name WHERE slug IS NULL")
    op.alter_column("sources", "slug", nullable=False)
    op.create_index("ix_sources_slug", "sources", ["slug"], unique=True)
    op.add_column("sources", sa.Column("category", sa.String(length=40), server_default="market", nullable=False))
    op.add_column("sources", sa.Column("source_class", sa.String(length=40), server_default="independent", nullable=False))
    op.add_column("sources", sa.Column("collection_method", sa.String(length=40), server_default="rest", nullable=False))
    op.add_column("sources", sa.Column("check_interval_seconds", sa.Integer(), server_default="21600", nullable=False))
    op.add_column("sources", sa.Column("rate_limit_per_minute", sa.Integer(), nullable=True))
    op.add_column("sources", sa.Column("auth_type", sa.String(length=40), server_default="none", nullable=False))
    op.add_column("sources", sa.Column("terms_url", sa.Text(), nullable=True))
    op.add_column("sources", sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("sources", sa.Column("etag", sa.String(length=240), nullable=True))
    op.add_column("sources", sa.Column("last_modified", sa.String(length=240), nullable=True))

    op.create_table(
        "model_families",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_model_families_company_id", "model_families", ["company_id"])
    op.create_index("ix_model_families_slug", "model_families", ["slug"], unique=True)

    op.add_column("models", sa.Column("family_id", sa.UUID(), nullable=True))
    op.add_column("models", sa.Column("status", sa.String(length=40), server_default="active", nullable=False))
    op.add_column("models", sa.Column("parameter_count", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_models_family_id", "models", "model_families", ["family_id"], ["id"])
    op.create_index("ix_models_family_id", "models", ["family_id"])

    op.create_table(
        "model_versions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("model_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.String(length=120), nullable=False),
        sa.Column("released_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("model_id", "version", name="uq_model_version"),
    )
    op.create_index("ix_model_versions_model_id", "model_versions", ["model_id"])

    op.create_table(
        "providers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("website_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_providers_slug", "providers", ["slug"], unique=True)

    op.create_table(
        "provider_endpoints",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("provider_id", sa.UUID(), nullable=False),
        sa.Column("model_id", sa.UUID(), nullable=False),
        sa.Column("api_id", sa.String(length=240), nullable=False),
        sa.Column("status", sa.String(length=40), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["provider_id"], ["providers.id"]),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "source_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("object_key", sa.Text(), nullable=True),
        sa.Column("content_type", sa.String(length=80), server_default="application/json", nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_source_documents_content_hash", "source_documents", ["content_hash"])

    op.create_table(
        "field_observations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("field_name", sa.String(length=80), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("document_id", sa.UUID(), nullable=True),
        sa.Column("reliability", sa.String(length=40), nullable=False),
        sa.Column("verification_status", sa.String(length=40), server_default="source_asserted", nullable=False),
        sa.Column("extraction_method", sa.String(length=40), server_default="parser", nullable=False),
        sa.Column("previous_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_current", sa.Boolean(), server_default="true", nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["source_documents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_field_observations_entity_id", "field_observations", ["entity_id"])
    op.create_index("ix_field_observations_is_current", "field_observations", ["is_current"])

    op.create_table(
        "claims",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("field_name", sa.String(length=80), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("document_id", sa.UUID(), nullable=True),
        sa.Column("asserted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reliability", sa.String(length=40), nullable=False),
        sa.Column("verification_status", sa.String(length=40), server_default="source_asserted", nullable=False),
        sa.Column("extraction_method", sa.String(length=40), server_default="parser", nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["source_documents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "benchmark_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("benchmark_id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("model_external_id", sa.String(length=240), nullable=False),
        sa.Column("model_version", sa.String(length=120), nullable=True),
        sa.Column("score", sa.Numeric(14, 6), nullable=False),
        sa.Column("score_type", sa.String(length=80), nullable=False),
        sa.Column("tested_at", sa.Date(), nullable=True),
        sa.Column("prompt_method", sa.String(length=160), nullable=True),
        sa.Column("temperature", sa.Numeric(6, 3), nullable=True),
        sa.Column("token_budget", sa.Integer(), nullable=True),
        sa.Column("pass_count", sa.Integer(), nullable=True),
        sa.Column("agent_harness", sa.String(length=160), nullable=True),
        sa.Column("tools", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("environment", sa.String(length=160), nullable=True),
        sa.Column("measured_by", sa.String(length=160), nullable=False),
        sa.Column("is_official", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("verification_status", sa.String(length=40), server_default="source_asserted", nullable=False),
        sa.Column("raw_data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["benchmark_id"], ["benchmark_definitions.id"]),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("change_events", sa.Column("absolute_change", sa.Numeric(18, 8), nullable=True))
    op.add_column("change_events", sa.Column("confidence", sa.String(length=20), server_default="source_asserted", nullable=False))
    op.add_column("change_events", sa.Column("verification_status", sa.String(length=40), server_default="source_asserted", nullable=False))
    op.add_column("change_events", sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False))

    op.create_table(
        "entity_aliases",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("canonical_key", sa.String(length=240), nullable=False),
        sa.Column("alias_key", sa.String(length=240), nullable=False),
        sa.Column("method", sa.String(length=40), nullable=False),
        sa.Column("confidence", sa.String(length=20), server_default="exact", nullable=False),
        sa.Column("approved", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alias_key", name="uq_entity_alias_key"),
    )

    op.create_table(
        "dedup_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("value", sa.String(length=128), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind", "value", name="uq_dedup_kind_value"),
    )

    op.create_table(
        "research_papers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("external_id", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("authors", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("published_at", sa.Date(), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("categories", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_research_papers_external_id", "research_papers", ["external_id"], unique=True)

    op.create_table(
        "technology_signals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("strength", sa.String(length=20), server_default="medium", nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_technology_signals_slug", "technology_signals", ["slug"], unique=True)

    op.create_table(
        "market_observations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_key", sa.String(length=240), nullable=False),
        sa.Column("metric", sa.String(length=80), nullable=False),
        sa.Column("value", sa.Numeric(18, 8), nullable=False),
        sa.Column("unit", sa.String(length=40), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=240), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "notification_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("companies", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("models", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("event_types", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("min_importance", sa.String(length=20), server_default="medium", nullable=False),
        sa.Column("min_change_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("channels", postgresql.JSONB(astext_type=sa.Text()), server_default='["in_app"]', nullable=False),
        sa.Column("digest", sa.String(length=20), server_default="instant", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("change_event_id", sa.UUID(), nullable=True),
        sa.Column("channel", sa.String(length=40), server_default="in_app", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="unread", nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("importance", sa.String(length=20), server_default="info", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["change_event_id"], ["change_events.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "collector_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("collector_name", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="running", nullable=False),
        sa.Column("events_published", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("raw_object_key", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "dead_letter_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("topic", sa.String(length=120), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("replayed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    for table in (
        "dead_letter_events",
        "collector_runs",
        "notifications",
        "notification_rules",
        "users",
        "market_observations",
        "technology_signals",
        "research_papers",
        "dedup_records",
        "entity_aliases",
        "benchmark_runs",
        "claims",
        "field_observations",
        "source_documents",
        "provider_endpoints",
        "providers",
        "model_versions",
    ):
        op.drop_table(table)
    op.drop_column("change_events", "evidence")
    op.drop_column("change_events", "verification_status")
    op.drop_column("change_events", "confidence")
    op.drop_column("change_events", "absolute_change")
    op.drop_constraint("fk_models_family_id", "models", type_="foreignkey")
    op.drop_column("models", "parameter_count")
    op.drop_column("models", "status")
    op.drop_column("models", "family_id")
    op.drop_table("model_families")
    op.drop_index("ix_sources_slug", table_name="sources")
    for column in (
        "last_modified",
        "etag",
        "is_active",
        "terms_url",
        "auth_type",
        "rate_limit_per_minute",
        "check_interval_seconds",
        "collection_method",
        "source_class",
        "category",
        "slug",
    ):
        op.drop_column("sources", column)
