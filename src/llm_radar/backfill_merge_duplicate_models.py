"""Merge catalog rows that resolve to the same organization + canonical name.

Entity resolution links aliases going forward, but rows created before the alias
existed were never folded together. This one-off reconciliation finds those
groups and merges each down to a single canonical row via
``canonical_pipeline.merge_models``.

    python -m llm_radar.backfill_merge_duplicate_models            # dry run
    python -m llm_radar.backfill_merge_duplicate_models --apply    # commit
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from llm_radar.canonical_pipeline import merge_models
from llm_radar.composite import canonical_model_name
from llm_radar.database.models import (
    Company,
    Model,
    ModelProfile,
    ModelSnapshot,
    PriceObservation,
)
from llm_radar.database.session import SessionLocal


@dataclass(frozen=True, slots=True)
class MergePlanEntry:
    canonical_key: tuple[str, str]
    target_id: UUID
    target_slug: str
    duplicate_slugs: list[str]


def _child_row_counts(session: Session) -> dict[UUID, int]:
    counts: dict[UUID, int] = defaultdict(int)
    for table in (ModelSnapshot, PriceObservation):
        for model_id, count in session.execute(
            select(table.model_id, func.count()).group_by(table.model_id)
        ):
            counts[model_id] += count
    for (model_id,) in session.execute(select(ModelProfile.model_id)):
        counts[model_id] += 1
    return counts


def _distinct_checkpoints(models: list[Model]) -> bool:
    """A group is left alone when its rows carry conflicting hard facts - a
    strong hint they are genuinely different checkpoints rather than the same
    model seen under two provider names."""
    release_dates = {m.release_date for m in models if m.release_date is not None}
    families = {m.family.strip().lower() for m in models if m.family}
    return len(release_dates) > 1 or len(families) > 1


def plan_merges(session: Session) -> list[MergePlanEntry]:
    """Group models by (canonical company, canonical name) and pick a survivor."""
    groups: dict[tuple[str, str], list[Model]] = defaultdict(list)
    for model, company_name in session.execute(
        select(Model, Company.name).join(Company, Company.id == Model.company_id)
    ):
        key = (canonical_model_name(company_name), canonical_model_name(model.name))
        if all(key):
            groups[key].append(model)

    counts = _child_row_counts(session)
    plan: list[MergePlanEntry] = []
    for key, models in groups.items():
        if len(models) < 2 or _distinct_checkpoints(models):
            continue
        # Survivor: most child rows, then the oldest row as a stable tie-break.
        target = max(models, key=lambda m: (counts.get(m.id, 0), -m.created_at.timestamp()))
        duplicates = [m for m in models if m.id != target.id]
        plan.append(
            MergePlanEntry(
                canonical_key=key,
                target_id=target.id,
                target_slug=target.slug,
                duplicate_slugs=[m.slug for m in duplicates],
            )
        )
    return plan


def run(session: Session, *, apply: bool) -> list[MergePlanEntry]:
    plan = plan_merges(session)
    if not apply:
        return plan
    for entry in plan:
        target = session.get(Model, entry.target_id)
        if target is None:
            continue
        for slug in entry.duplicate_slugs:
            source = session.scalar(select(Model).where(Model.slug == slug))
            if source is not None:
                merge_models(session, source=source, target=target)
    return plan


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="commit the merges (default: dry run)")
    args = parser.parse_args()

    with SessionLocal() as session:
        plan = run(session, apply=args.apply)
        if args.apply:
            session.commit()

    merged = sum(len(entry.duplicate_slugs) for entry in plan)
    verb = "merged" if args.apply else "would merge"
    print(f"Duplicate model backfill: {len(plan)} groups, {verb} {merged} rows")
    for entry in plan:
        org, name = entry.canonical_key
        print(f"  [{org} / {name}] keep {entry.target_slug} <- {', '.join(entry.duplicate_slugs)}")


if __name__ == "__main__":
    main()
