"""enrich submission context and model demand requirements

Revision ID: n4i6c8e0f124
Revises: e76e39270c0a
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n4i6c8e0f124"
down_revision: str | None = "e76e39270c0a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "feedback",
        sa.Column(
            "submission_context",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    op.add_column(
        "model_demands",
        sa.Column("usage_volume", sa.String(length=24), nullable=True),
    )
    op.add_column(
        "model_demands",
        sa.Column("budget_range", sa.String(length=24), nullable=True),
    )
    op.add_column(
        "model_demands",
        sa.Column("deployment_preference", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "model_demands",
        sa.Column("timeline", sa.String(length=24), nullable=True),
    )
    op.add_column(
        "model_demands",
        sa.Column(
            "submission_context",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "model_demands",
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default="new",
        ),
    )

    for column in (
        "usage_volume",
        "budget_range",
        "deployment_preference",
        "timeline",
        "status",
    ):
        op.create_index(
            f"ix_model_demands_{column}",
            "model_demands",
            [column],
            unique=False,
        )

    op.alter_column("feedback", "submission_context", server_default=None)
    op.alter_column("model_demands", "submission_context", server_default=None)
    op.alter_column("model_demands", "status", server_default=None)


def downgrade() -> None:
    for column in reversed(
        (
            "usage_volume",
            "budget_range",
            "deployment_preference",
            "timeline",
            "status",
        )
    ):
        op.drop_index(f"ix_model_demands_{column}", table_name="model_demands")

    op.drop_column("model_demands", "status")
    op.drop_column("model_demands", "submission_context")
    op.drop_column("model_demands", "timeline")
    op.drop_column("model_demands", "deployment_preference")
    op.drop_column("model_demands", "budget_range")
    op.drop_column("model_demands", "usage_volume")
    op.drop_column("feedback", "submission_context")
