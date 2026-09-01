"""sanitize negative price sentinels

Revision ID: g7b9c1d4e506
Revises: f6a8b0c3d405
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g7b9c1d4e506"
down_revision: str | None = "f6a8b0c3d405"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for column in ("input_price", "output_price", "cache_read_price", "cache_write_price"):
        op.execute(
            sa.text(f"UPDATE price_observations SET {column} = NULL WHERE {column} < 0")
        )
    for column in ("input_price", "output_price", "cache_read_price"):
        op.execute(sa.text(f"UPDATE model_profiles SET {column} = NULL WHERE {column} < 0"))


def downgrade() -> None:
    pass
