"""merge provider alias companies

Revision ID: h8c0d2e5f607
Revises: g7b9c1d4e506
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h8c0d2e5f607"
down_revision: str | None = "g7b9c1d4e506"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # OpenRouter uses a leading ``~`` for some routed aliases. Those aliases
    # describe the same developer and should not become separate companies.
    op.execute(
        sa.text(
            """
            UPDATE models AS model
            SET company_id = canonical.id
            FROM companies AS alias
            JOIN companies AS canonical ON canonical.slug = LTRIM(alias.slug, '~')
            WHERE model.company_id = alias.id
              AND alias.slug LIKE '~%'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE model_families AS family
            SET company_id = canonical.id
            FROM companies AS alias
            JOIN companies AS canonical ON canonical.slug = LTRIM(alias.slug, '~')
            WHERE family.company_id = alias.id
              AND alias.slug LIKE '~%'
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM companies AS alias
            WHERE alias.slug LIKE '~%'
              AND EXISTS (
                  SELECT 1
                  FROM companies AS canonical
                  WHERE canonical.slug = LTRIM(alias.slug, '~')
              )
            """
        )
    )


def downgrade() -> None:
    # The former split was invalid and cannot be reconstructed unambiguously.
    pass
