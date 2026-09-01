import argparse
from dataclasses import dataclass

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import (
    LeaderboardSnapshot,
    Model,
    ModelProfile,
    ModelSnapshot,
    Source,
)
from llm_radar.database.session import SessionLocal
from llm_radar.profile_service import (
    propagate_availability_evidence,
    propagate_open_weight_evidence,
    upsert_model_profile,
)


@dataclass(frozen=True)
class BackfillResult:
    scanned: int
    created: int
    updated: int


def backfill_model_profiles(
    session: Session, *, limit: int | None = None, rebuild: bool = True
) -> BackfillResult:
    """Merge every source snapshot into canonical profiles; safe to rerun."""
    model_ids = select(Model.id).order_by(Model.id)
    if limit is not None:
        model_ids = model_ids.limit(limit)
    existing = set(
        session.scalars(select(ModelProfile.model_id).where(ModelProfile.model_id.in_(model_ids)))
    )
    if rebuild:
        session.execute(delete(ModelProfile).where(ModelProfile.model_id.in_(model_ids)))
        session.execute(
            update(Model).where(Model.id.in_(model_ids)).values(is_open_weight=None, license=None)
        )
        session.flush()

    query = (
        select(Model, ModelSnapshot)
        .join(ModelSnapshot, ModelSnapshot.model_id == Model.id)
        .where(Model.id.in_(model_ids))
        .order_by(Model.id, ModelSnapshot.observed_at, ModelSnapshot.id)
    )

    seen: set[object] = set()
    for model, snapshot in session.execute(query):
        if model.id not in seen:
            seen.add(model.id)
        upsert_model_profile(
            session,
            model=model,
            source_id=snapshot.source_id,
            observed_at=snapshot.observed_at,
            payload=snapshot.data,
        )
        propagate_open_weight_evidence(
            session,
            model=model,
            source_id=snapshot.source_id,
            observed_at=snapshot.observed_at,
            payload=snapshot.data,
        )

    availability_rows = session.execute(
        select(LeaderboardSnapshot, Source)
        .join(Source, Source.id == LeaderboardSnapshot.source_id)
        .order_by(LeaderboardSnapshot.observed_at, LeaderboardSnapshot.id)
    )
    models_by_slug = {
        model.slug: model for model in session.scalars(select(Model).where(Model.id.in_(model_ids)))
    }
    models_by_name: dict[str, list[Model]] = {}
    for model in models_by_slug.values():
        if ":" not in model.slug:
            models_by_name.setdefault(canonical_model_name(model.name), []).append(model)
    for snapshot, source in availability_rows:
        model_slug = str(snapshot.raw_data.get("model_slug") or "").lower()
        model = models_by_slug.get(model_slug)
        if model is None:
            candidates = models_by_name.get(canonical_model_name(snapshot.model_external_id), [])
            model = candidates[0] if len(candidates) == 1 else None
        if model is None:
            continue
        open_weights = snapshot.raw_data.get("open_weights")
        proprietary_claim = (
            source.name != "artificial-analysis"
            and str(snapshot.raw_data.get("license") or snapshot.license or "").lower()
            == "proprietary"
        )
        if not isinstance(open_weights, bool) and not proprietary_claim:
            continue
        availability = "open_weight" if open_weights is True else "proprietary"
        payload = {
            "availability": availability,
            "is_open_weight": availability == "open_weight",
            "availability_evidence": {
                "kind": "leaderboard_license_assertion",
                "source_url": source.url,
                "open_weights": open_weights,
                "license": snapshot.raw_data.get("license") or snapshot.license,
            },
        }
        license_name = snapshot.raw_data.get("license") or snapshot.license
        if license_name:
            payload["license"] = license_name
        upsert_model_profile(
            session,
            model=model,
            source_id=source.id,
            observed_at=snapshot.observed_at,
            payload=payload,
        )
        propagate_availability_evidence(
            session,
            model=model,
            source_id=source.id,
            observed_at=snapshot.observed_at,
            payload=payload,
        )
    return BackfillResult(
        scanned=len(seen), created=len(seen - existing), updated=len(seen & existing)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill canonical model profiles")
    parser.add_argument("--limit", type=int, help="Process at most this many models")
    parser.add_argument(
        "--dry-run", action="store_true", help="Build profiles and roll the transaction back"
    )
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")

    with SessionLocal() as session:
        result = backfill_model_profiles(session, limit=args.limit)
        if args.dry_run:
            session.rollback()
        else:
            session.commit()
    mode = "dry-run" if args.dry_run else "committed"
    print(
        f"Model profile backfill {mode}: "
        f"{result.scanned} scanned, {result.created} created, {result.updated} updated"
    )


if __name__ == "__main__":
    main()
