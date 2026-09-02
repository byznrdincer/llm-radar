"""enrich feedback and model demand

Revision ID: e76e39270c0a
Revises: m3h5b7d9e013
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "e76e39270c0a"
down_revision: str | None = "m3h5b7d9e013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Feedback enrichment
    op.add_column(
        "feedback",
        sa.Column(
            "related_model_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "feedback",
        sa.Column("subject", sa.String(length=60), nullable=True),
    )
    op.add_column(
        "feedback",
        sa.Column("severity", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "feedback",
        sa.Column("source_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "feedback",
        sa.Column("product_area", sa.String(length=80), nullable=True),
    )

    op.create_index(
        "ix_feedback_related_model_id",
        "feedback",
        ["related_model_id"],
        unique=False,
    )
    op.create_index(
        "ix_feedback_subject",
        "feedback",
        ["subject"],
        unique=False,
    )
    op.create_index(
        "ix_feedback_severity",
        "feedback",
        ["severity"],
        unique=False,
    )
    op.create_index(
        "ix_feedback_product_area",
        "feedback",
        ["product_area"],
        unique=False,
    )

    # Model demand enrichment.
    # Existing rows need [] while these columns are introduced.
    op.add_column(
        "model_demands",
        sa.Column(
            "requested_model_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "model_demands",
        sa.Column(
            "use_cases",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "model_demands",
        sa.Column(
            "criteria",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "model_demands",
        sa.Column("demand_level", sa.String(length=24), nullable=True),
    )

    op.create_index(
        "ix_model_demands_demand_level",
        "model_demands",
        ["demand_level"],
        unique=False,
    )

    # Model code uses Python-side default=list rather than DB server defaults.
    op.alter_column(
        "model_demands",
        "requested_model_ids",
        server_default=None,
    )
    op.alter_column(
        "model_demands",
        "use_cases",
        server_default=None,
    )
    op.alter_column(
        "model_demands",
        "criteria",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_model_demands_demand_level",
        table_name="model_demands",
    )

    op.drop_column("model_demands", "demand_level")
    op.drop_column("model_demands", "criteria")
    op.drop_column("model_demands", "use_cases")
    op.drop_column("model_demands", "requested_model_ids")

    op.drop_index("ix_feedback_product_area", table_name="feedback")
    op.drop_index("ix_feedback_severity", table_name="feedback")
    op.drop_index("ix_feedback_subject", table_name="feedback")
    op.drop_index(
        "ix_feedback_related_model_id",
        table_name="feedback",
    )

    op.drop_column("feedback", "product_area")
    op.drop_column("feedback", "source_url")
    op.drop_column("feedback", "severity")
    op.drop_column("feedback", "subject")
    op.drop_column("feedback", "related_model_id")
