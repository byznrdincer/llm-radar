"""add leaderboard snapshots

Revision ID: 8c34d172a9fe
Revises: 50c35a26d251
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "8c34d172a9fe"
down_revision: str | None = "50c35a26d251"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "benchmark_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sources.id")),
        sa.Column("slug", sa.String(160), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("methodology_url", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_benchmark_definitions_slug", "benchmark_definitions", ["slug"])
    op.create_index("ix_benchmark_definitions_category", "benchmark_definitions", ["category"])
    op.create_index("ix_benchmark_definitions_source_id", "benchmark_definitions", ["source_id"])
    op.create_table(
        "leaderboard_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("benchmark_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("benchmark_definitions.id")),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sources.id")),
        sa.Column("model_external_id", sa.String(240), nullable=False),
        sa.Column("organization", sa.String(160), nullable=False),
        sa.Column("license", sa.String(120)),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("score", sa.Numeric(14, 6), nullable=False),
        sa.Column("score_lower", sa.Numeric(14, 6)),
        sa.Column("score_upper", sa.Numeric(14, 6)),
        sa.Column("vote_count", sa.Integer()),
        sa.Column("published_at", sa.Date(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_data", postgresql.JSONB(), nullable=False),
    )
    for column in ("benchmark_id", "source_id", "model_external_id", "organization", "category", "rank", "published_at", "observed_at"):
        op.create_index(f"ix_leaderboard_snapshots_{column}", "leaderboard_snapshots", [column])


def downgrade() -> None:
    op.drop_table("leaderboard_snapshots")
    op.drop_table("benchmark_definitions")
