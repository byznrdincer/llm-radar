"""expand model parameter counts to bigint

Revision ID: m3h5b7d9e013
Revises: l2g4a6b8d012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m3h5b7d9e013"
down_revision: str | None = "l2g4a6b8d012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "models",
        "parameter_count",
        existing_type=sa.Integer(),
        type_=sa.BigInteger(),
        existing_nullable=True,
    )
    op.alter_column(
        "models",
        "active_parameter_count",
        existing_type=sa.Integer(),
        type_=sa.BigInteger(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "models",
        "active_parameter_count",
        existing_type=sa.BigInteger(),
        type_=sa.Integer(),
        existing_nullable=True,
    )
    op.alter_column(
        "models",
        "parameter_count",
        existing_type=sa.BigInteger(),
        type_=sa.Integer(),
        existing_nullable=True,
    )
