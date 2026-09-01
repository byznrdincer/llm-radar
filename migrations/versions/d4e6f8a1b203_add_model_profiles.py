"""add canonical model profiles

Revision ID: d4e6f8a1b203
Revises: c9e4b1a7d302
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4e6f8a1b203"
down_revision: str | None = "c9e4b1a7d302"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "model_profiles",
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("context_window", sa.Integer()),
        sa.Column("max_output_tokens", sa.Integer()),
        sa.Column("input_price", sa.Numeric(18, 8)),
        sa.Column("output_price", sa.Numeric(18, 8)),
        sa.Column("cache_read_price", sa.Numeric(18, 8)),
        sa.Column("modalities", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("capabilities", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("supports_tool_calling", sa.Boolean()),
        sa.Column("supports_structured_output", sa.Boolean()),
        sa.Column("supports_reasoning", sa.Boolean()),
        sa.Column("supports_streaming", sa.Boolean()),
        sa.Column("availability", sa.String(32)),
        sa.Column("license", sa.String(120)),
        sa.Column("commercial_use_allowed", sa.Boolean()),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("model_id"),
    )
    for column in (
        "context_window", "input_price", "output_price", "supports_tool_calling",
        "supports_reasoning", "availability", "license", "source_id", "observed_at",
    ):
        op.create_index(f"ix_model_profiles_{column}", "model_profiles", [column])


def downgrade() -> None:
    op.drop_table("model_profiles")
