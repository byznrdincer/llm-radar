"""add leaderboard snapshot identity

Revision ID: l2g4a6b8d012
Revises: k1f3a5b7c901
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "l2g4a6b8d012"
down_revision: str | None = "k1f3a5b7c901"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM leaderboard_snapshots
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        row_number() OVER (
                            PARTITION BY
                                benchmark_id,
                                model_external_id,
                                category,
                                published_at
                            ORDER BY observed_at DESC, id DESC
                        ) AS duplicate_number
                    FROM leaderboard_snapshots
                ) AS ranked_snapshots
                WHERE duplicate_number > 1
            )
            """
        )
    )
    op.create_unique_constraint(
        "uq_leaderboard_snapshot_identity",
        "leaderboard_snapshots",
        ["benchmark_id", "model_external_id", "category", "published_at"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_leaderboard_snapshot_identity",
        "leaderboard_snapshots",
        type_="unique",
    )
