"""Refresh the denormalized read-model fields on ``model_profiles``.

``general_score`` (leaderboard percentile for the "general" focus) and
``effective_openness`` (profile openness, else the license/family fallback) are
both derived from slowly-changing data. Recomputing them per request forced the
event feed and model search to materialize every candidate in memory to filter
and sort. This job rebuilds both columns so those endpoints work in SQL.

    python -m llm_radar.read_model            # refresh and commit
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import Company, Model, ModelProfile
from llm_radar.database.session import SessionLocal
from llm_radar.model_selection import selection_matches


@dataclass(frozen=True, slots=True)
class ReadModelRefreshResult:
    scanned: int
    updated: int


def refresh_read_model(session: Session) -> ReadModelRefreshResult:
    """Recompute ``general_score`` and ``effective_openness`` for every profile."""
    # Local import: the openness resolver lives in the API module and pulls a
    # large dependency tree that this job does not otherwise need.
    from llm_radar.api.routes import _resolved_compare_openness

    general = selection_matches(session, "general")
    rows = session.execute(
        select(Model, Company, ModelProfile)
        .join(Company, Company.id == Model.company_id)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
    ).all()

    updated = 0
    for model, company, profile in rows:
        match = general.get(canonical_model_name(model.name))
        score = Decimal(str(match.score)) if match is not None else None
        openness = _resolved_compare_openness(model, company, profile)
        if profile.general_score != score or profile.effective_openness != openness:
            profile.general_score = score
            profile.effective_openness = openness
            updated += 1

    return ReadModelRefreshResult(scanned=len(rows), updated=updated)


def main() -> None:
    with SessionLocal() as session:
        result = refresh_read_model(session)
        session.commit()
    print(f"Read model refresh: {result.scanned} scanned, {result.updated} updated")


if __name__ == "__main__":
    main()
