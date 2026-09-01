"""canonicalize company aliases

Revision ID: i9d1e3f6a708
Revises: h8c0d2e5f607
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "i9d1e3f6a708"
down_revision: str | None = "h8c0d2e5f607"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ALIASES = (
    ("deepseek-ai", "deepseek", "DeepSeek"),
    ("meta-llama", "meta", "Meta"),
    ("minimaxai", "minimax", "MiniMax"),
    ("mistralai", "mistral", "Mistral AI"),
    ("moonshotai", "moonshot", "Moonshot AI"),
    ("x-ai", "xai", "xAI"),
    ("z-ai", "zai", "Z.ai"),
)

DISPLAY_NAMES = {
    "ai21": "AI21",
    "nvidia": "NVIDIA",
    "openai": "OpenAI",
    "qwen": "Qwen",
}


def upgrade() -> None:
    connection = op.get_bind()
    for alias_slug, canonical_slug, display_name in ALIASES:
        alias_id = connection.scalar(
            sa.text("SELECT id FROM companies WHERE slug = :slug"), {"slug": alias_slug}
        )
        canonical_id = connection.scalar(
            sa.text("SELECT id FROM companies WHERE slug = :slug"), {"slug": canonical_slug}
        )
        if alias_id is not None and canonical_id is not None:
            connection.execute(
                sa.text("UPDATE models SET company_id = :canonical WHERE company_id = :alias"),
                {"canonical": canonical_id, "alias": alias_id},
            )
            connection.execute(
                sa.text(
                    "UPDATE model_families SET company_id = :canonical WHERE company_id = :alias"
                ),
                {"canonical": canonical_id, "alias": alias_id},
            )
            connection.execute(
                sa.text("DELETE FROM companies WHERE id = :alias"), {"alias": alias_id}
            )
        elif alias_id is not None:
            connection.execute(
                sa.text("UPDATE companies SET slug = :slug, name = :name WHERE id = :id"),
                {"slug": canonical_slug, "name": display_name, "id": alias_id},
            )
            canonical_id = alias_id
        if canonical_id is not None:
            connection.execute(
                sa.text("UPDATE companies SET name = :name WHERE id = :id"),
                {"name": display_name, "id": canonical_id},
            )

    for slug, display_name in DISPLAY_NAMES.items():
        connection.execute(
            sa.text("UPDATE companies SET name = :name WHERE slug = :slug"),
            {"name": display_name, "slug": slug},
        )


def downgrade() -> None:
    # Canonical company ownership cannot be split back without inventing data.
    pass
