"""add source health fields

Revision ID: a1f8e2d9c401
Revises: 8c34d172a9fe
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1f8e2d9c401"
down_revision: str | None = "8c34d172a9fe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sources", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column(
        "sources",
        sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("sources", "consecutive_failures")
    op.drop_column("sources", "last_error")
