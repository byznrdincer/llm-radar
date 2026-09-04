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

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import Company, Model, ModelFocusScore, ModelProfile
from llm_radar.database.session import SessionLocal
from llm_radar.model_selection import BENCHMARK_FOCUSES, BenchmarkMatch, selection_matches
from llm_radar.openness import _resolved_compare_openness

# "general" stays on ModelProfile.general_score - it is kept fresh inline by
# the processor (see refresh_model_read_fields). The other focuses are niche
# enough, and cheap enough to recompute from a 600s-cached selection_matches
# call, that they only need the periodic sweep.
_SIDE_TABLE_FOCUSES = tuple(focus for focus in BENCHMARK_FOCUSES if focus != "general")


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


def refresh_focus_scores(session: Session) -> int:
    """Rebuild model_focus_scores for every non-general benchmark focus, so
    /models/search's benchmark_focus / advancedness / best_match sort work in
    SQL for those focuses too, the same way general_score already does for
    the default focus. Returns the number of (model, focus) rows written.

    Scores every *row*, not every distinct canonical name: two catalog rows
    that happen to share a canonical name (unmerged duplicates) each get the
    match independently, the same way the per-model-row general_score refresh
    and the old in-Python search filter both already treat duplicates - a
    name -> single model_id map here would arbitrarily drop one of them.
    """
    catalog = list(session.execute(select(Model.id, Model.name)))
    written = 0
    for focus in _SIDE_TABLE_FOCUSES:
        matches = selection_matches(session, focus)
        rows = [
            {"model_id": model_id, "focus": focus, "score": Decimal(str(match.score))}
            for model_id, name in catalog
            if (match := matches.get(canonical_model_name(name))) is not None
        ]
        if rows:
            stmt = pg_insert(ModelFocusScore).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=[ModelFocusScore.model_id, ModelFocusScore.focus],
                set_={"score": stmt.excluded.score},
            )
            session.execute(stmt)
            written += len(rows)
        session.execute(
            delete(ModelFocusScore).where(
                ModelFocusScore.focus == focus,
                ModelFocusScore.model_id.notin_([row["model_id"] for row in rows]),
            )
        )
    return written


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
        focus_rows = refresh_focus_scores(session)
        session.commit()
    print(
        f"Read model refresh: {result.scanned} scanned, {result.updated} updated, "
        f"{focus_rows} focus scores written"
    )


if __name__ == "__main__":
    main()
