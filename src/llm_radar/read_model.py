"""Refresh the denormalized read-model fields on ``model_profiles``.

``general_score`` (leaderboard percentile for the "general" focus) and
``effective_openness`` (profile openness, else the license/family fallback) are
both derived from slowly-changing data. Recomputing them per request forced the
event feed and model search to materialize every candidate in memory to filter
and sort. This job rebuilds both columns so those endpoints work in SQL.

    python -m llm_radar.read_model            # refresh and commit

That full sweep runs on the scheduler's benchmark cadence (~12h), which is fine
for the whole catalog drifting with leaderboard updates. A single model's own
change (license, availability, profile fields) shouldn't have to wait that long
to show up in openness filters, so the processor calls
``refresh_model_read_fields`` for the model it just touched, in the same
transaction - if that transaction rolls back, the stale read-model row rolls
back with it, and there is no separate "dirty" table to keep consistent.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import Company, Model, ModelProfile
from llm_radar.database.session import SessionLocal
from llm_radar.model_selection import BenchmarkMatch, selection_matches
from llm_radar.openness import _resolved_compare_openness


@dataclass(frozen=True, slots=True)
class ReadModelRefreshResult:
    scanned: int
    updated: int


def _apply_read_model_fields(
    model: Model,
    company: Company,
    profile: ModelProfile,
    general: dict[str, BenchmarkMatch],
) -> bool:
    match = general.get(canonical_model_name(model.name))
    score = Decimal(str(match.score)) if match is not None else None
    openness = _resolved_compare_openness(model, company, profile)
    if profile.general_score == score and profile.effective_openness == openness:
        return False
    profile.general_score = score
    profile.effective_openness = openness
    return True


def refresh_read_model(session: Session) -> ReadModelRefreshResult:
    """Recompute ``general_score`` and ``effective_openness`` for every profile."""
    general = selection_matches(session, "general")
    rows = session.execute(
        select(Model, Company, ModelProfile)
        .join(Company, Company.id == Model.company_id)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
    ).all()

    updated = sum(
        _apply_read_model_fields(model, company, profile, general)
        for model, company, profile in rows
    )
    return ReadModelRefreshResult(scanned=len(rows), updated=updated)


def refresh_model_read_fields(session: Session, model_id: UUID) -> bool:
    """Recompute the read-model fields for a single model right after the
    processor changes it, so a filter on openness or model level reflects the
    change immediately instead of waiting for the next periodic sweep.

    ``selection_matches`` is itself TTL-cached (600s), so calling this per
    touched model does not repeat the whole-catalog leaderboard scan; it costs
    one extra row lookup. Returns whether anything changed.
    """
    row = session.execute(
        select(Model, Company, ModelProfile)
        .join(Company, Company.id == Model.company_id)
        .join(ModelProfile, ModelProfile.model_id == Model.id)
        .where(Model.id == model_id)
    ).first()
    if row is None:
        return False
    general = selection_matches(session, "general")
    return _apply_read_model_fields(row[0], row[1], row[2], general)


def main() -> None:
    with SessionLocal() as session:
        result = refresh_read_model(session)
        session.commit()
    print(f"Read model refresh: {result.scanned} scanned, {result.updated} updated")


if __name__ == "__main__":
    main()
