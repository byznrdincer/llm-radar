"""add model_focus_scores table

Revision ID: q7l9e1a3b458
Revises: p6k8d0f2a347
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q7l9e1a3b458"
down_revision: str | None = "p6k8d0f2a347"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "model_focus_scores",
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("focus", sa.String(length=20), nullable=False),
        sa.Column("score", sa.Numeric(precision=5, scale=1), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("model_id", "focus"),
    )
    op.create_index(
        "ix_model_focus_scores_focus_score", "model_focus_scores", ["focus", "score"]
    )


def downgrade() -> None:
    op.drop_index("ix_model_focus_scores_focus_score", table_name="model_focus_scores")
    op.drop_table("model_focus_scores")
