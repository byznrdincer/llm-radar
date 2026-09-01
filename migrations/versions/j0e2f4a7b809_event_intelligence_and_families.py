"""event intelligence and model families

Revision ID: j0e2f4a7b809
Revises: i9d1e3f6a708
"""

from collections.abc import Sequence
import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from llm_radar.event_intelligence import classify_event, score_importance
from llm_radar.model_family import infer_model_family

revision: str = "j0e2f4a7b809"
down_revision: str | None = "i9d1e3f6a708"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "change_events",
        sa.Column("category", sa.String(40), server_default="model_update", nullable=False),
    )
    op.add_column(
        "change_events",
        sa.Column("importance_score", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "change_events",
        sa.Column(
            "importance_factors",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.create_index("ix_change_events_category", "change_events", ["category"])
    op.create_index("ix_change_events_importance_score", "change_events", ["importance_score"])
    op.create_index("ix_models_family", "models", ["family"])

    connection = op.get_bind()
    events = connection.execute(
        sa.text(
            "SELECT id, event_type, title, new_value, change_percentage, evidence, "
            "verification_status FROM change_events"
        )
    ).mappings()
    for event in events:
        evidence = event["evidence"] or {}
        payload = {
            "new_value": event["new_value"] or {},
            "change_percentage": event["change_percentage"],
        }
        result = score_importance(
            event["event_type"],
            payload,
            title=event["title"],
            reliability=str(evidence.get("reliability") or "unverified"),
            verification_status=event["verification_status"],
        )
        connection.execute(
            sa.text(
                "UPDATE change_events SET category=:category, importance=:importance, "
                "importance_score=:score, importance_factors=CAST(:factors AS jsonb) "
                "WHERE id=:id"
            ),
            {
                "id": event["id"],
                "category": classify_event(event["event_type"], event["title"], payload),
                "importance": result.level,
                "score": result.score,
                "factors": json.dumps(result.factors),
            },
        )

    models = connection.execute(
        sa.text("SELECT id, name, slug FROM models WHERE family IS NULL OR family = ''")
    ).mappings()
    for model in models:
        connection.execute(
            sa.text("UPDATE models SET family=:family WHERE id=:id"),
            {
                "id": model["id"],
                "family": infer_model_family(model["name"], model["slug"]),
            },
        )


def downgrade() -> None:
    op.drop_index("ix_models_family", table_name="models")
    op.drop_index("ix_change_events_importance_score", table_name="change_events")
    op.drop_index("ix_change_events_category", table_name="change_events")
    op.drop_column("change_events", "importance_factors")
    op.drop_column("change_events", "importance_score")
    op.drop_column("change_events", "category")
