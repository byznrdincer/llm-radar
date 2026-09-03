"""add model demand submitter profile fields

Revision ID: o5j7c9e1f236
Revises: n4i6c8e0f124
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "o5j7c9e1f236"
down_revision: str | None = "n4i6c8e0f124"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "model_demands",
        sa.Column(
            "user_type",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "model_demands",
        sa.Column("full_name", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "model_demands",
        sa.Column("organization_name", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "model_demands",
        sa.Column("user_note", sa.Text(), nullable=True),
    )

    op.alter_column("model_demands", "user_type", server_default=None)


def downgrade() -> None:
    op.drop_column("model_demands", "user_note")
    op.drop_column("model_demands", "organization_name")
    op.drop_column("model_demands", "full_name")
    op.drop_column("model_demands", "user_type")
