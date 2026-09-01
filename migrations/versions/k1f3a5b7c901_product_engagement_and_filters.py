"""product engagement and extended model filters

Revision ID: k1f3a5b7c901
Revises: j0e2f4a7b809
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "k1f3a5b7c901"
down_revision: str | None = "j0e2f4a7b809"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("models", sa.Column("active_parameter_count", sa.Integer()))
    op.add_column("model_profiles", sa.Column("openness", sa.String(32)))
    op.add_column("model_profiles", sa.Column("commercial_use_status", sa.String(32)))
    op.create_index("ix_model_profiles_openness", "model_profiles", ["openness"])
    op.create_index(
        "ix_model_profiles_commercial_use_status",
        "model_profiles",
        ["commercial_use_status"],
    )
    op.execute(
        sa.text(
            """
            UPDATE model_profiles
            SET openness = CASE
                WHEN availability IN ('proprietary', 'closed_source') THEN 'proprietary'
                WHEN availability IN ('open_weight', 'open_source') THEN availability
                ELSE 'unknown'
            END,
            commercial_use_status = CASE
                WHEN commercial_use_allowed IS TRUE THEN 'allowed'
                WHEN commercial_use_allowed IS FALSE THEN 'restricted'
                ELSE 'unknown'
            END
            """
        )
    )

    op.create_table(
        "analytics_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_id", postgresql.UUID(as_uuid=True)),
        sa.Column(
            "related_model_ids",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "filters",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "sort",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("page", sa.String(120), server_default="/", nullable=False),
        sa.Column(
            "event_metadata",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_analytics_events_event_type", "analytics_events", ["event_type"])
    op.create_index("ix_analytics_events_session_id", "analytics_events", ["session_id"])
    op.create_index("ix_analytics_events_model_id", "analytics_events", ["model_id"])
    op.create_index("ix_analytics_events_created_at", "analytics_events", ["created_at"])

    op.create_table(
        "feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True)),
        sa.Column("feedback_type", sa.String(40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(24), server_default="new", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feedback_session_id", "feedback", ["session_id"])
    op.create_index("ix_feedback_feedback_type", "feedback", ["feedback_type"])
    op.create_index("ix_feedback_status", "feedback", ["status"])
    op.create_index("ix_feedback_created_at", "feedback", ["created_at"])

    op.create_table(
        "model_demands",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "requested_models",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("other_model", sa.String(200)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_model_demands_session_id", "model_demands", ["session_id"])
    op.create_index("ix_model_demands_created_at", "model_demands", ["created_at"])


def downgrade() -> None:
    op.drop_table("model_demands")
    op.drop_table("feedback")
    op.drop_table("analytics_events")
    op.drop_index("ix_model_profiles_commercial_use_status", table_name="model_profiles")
    op.drop_index("ix_model_profiles_openness", table_name="model_profiles")
    op.drop_column("model_profiles", "commercial_use_status")
    op.drop_column("model_profiles", "openness")
    op.drop_column("models", "active_parameter_count")
