"""add read-model fields to model_profiles

Revision ID: p6k8d0f2a347
Revises: o5j7c9e1f236
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p6k8d0f2a347"
down_revision: str | None = "o5j7c9e1f236"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "model_profiles",
        sa.Column("general_score", sa.Numeric(precision=5, scale=1), nullable=True),
    )
    op.add_column(
        "model_profiles",
        sa.Column("effective_openness", sa.String(length=32), nullable=True),
    )
    op.create_index(
        "ix_model_profiles_general_score", "model_profiles", ["general_score"]
    )
    op.create_index(
        "ix_model_profiles_effective_openness", "model_profiles", ["effective_openness"]
    )


def downgrade() -> None:
    op.drop_index("ix_model_profiles_effective_openness", table_name="model_profiles")
    op.drop_index("ix_model_profiles_general_score", table_name="model_profiles")
    op.drop_column("model_profiles", "effective_openness")
    op.drop_column("model_profiles", "general_score")
