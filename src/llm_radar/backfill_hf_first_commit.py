"""Backfill Hugging Face publish dates from the repo's first git commit.

HF Hub remapped many classic cards (BERTurk, Electra-tr, …) to a single
`createdAt` on 2022-03-02. The Turkey LLM year view therefore missed 2020–2021.
This script rewrites the latest snapshot's `published_at` from commits/main.
"""

from __future__ import annotations

import argparse
import logging
from copy import deepcopy
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.collectors.huggingface import (
    _HF_CREATED_AT_MIGRATION_PREFIX,
    _earliest_iso,
    _headers,
    _needs_first_commit,
    _turkish_name_hint,
)
from llm_radar.database.models import Company, Model, ModelSnapshot
from llm_radar.database.session import SessionLocal

logger = logging.getLogger(__name__)


def _model_id_from_snapshot(data: dict[str, Any], company_slug: str, model_name: str) -> str | None:
    for key in ("external_id", "modelId", "id"):
        value = data.get(key)
        if isinstance(value, str) and "/" in value:
            return value
    url = data.get("url") or data.get("repository")
    if isinstance(url, str) and "huggingface.co/" in url:
        return url.split("huggingface.co/", 1)[1].strip("/").split("/tree")[0].split("/blob")[0]
    if company_slug and model_name:
        return f"{company_slug}/{model_name}"
    return None


def _first_commit_at(client: httpx.Client, model_id: str) -> str | None:
    response = client.get(
        f"https://huggingface.co/api/models/{model_id}/commits/main",
        headers=_headers(),
        timeout=30.0,
    )
    if response.status_code >= 400:
        return None
    payload = response.json()
    if not isinstance(payload, list):
        return None
    dates = [
        str(entry.get("date"))
        for entry in payload
        if isinstance(entry, dict) and entry.get("date")
    ]
    return min(dates) if dates else None


def _should_enrich(company_slug: str, model_name: str, created: str | None) -> bool:
    return _needs_first_commit(company_slug, created, model_name=model_name) or (
        bool(created and created.startswith(_HF_CREATED_AT_MIGRATION_PREFIX))
        and _turkish_name_hint(model_name)
    )


def backfill_hf_first_commits(
    session: Session,
    *,
    limit: int | None = None,
    dry_run: bool = False,
    only_migration: bool = False,
) -> dict[str, int]:
    latest_ids = (
        select(ModelSnapshot.id)
        .distinct(ModelSnapshot.model_id)
        .order_by(ModelSnapshot.model_id, ModelSnapshot.observed_at.desc())
    )
    query = (
        select(ModelSnapshot, Model, Company)
        .join(Model, Model.id == ModelSnapshot.model_id)
        .join(Company, Company.id == Model.company_id)
        .where(ModelSnapshot.id.in_(latest_ids))
        .order_by(Company.slug, Model.name)
    )
    if limit is not None:
        query = query.limit(limit)

    scanned = updated = skipped = failed = 0
    with httpx.Client() as client:
        for snapshot, model, company in session.execute(query):
            scanned += 1
            data = snapshot.data if isinstance(snapshot.data, dict) else None
            if not data:
                skipped += 1
                continue

            published = data.get("published_at")
            created = published if isinstance(published, str) else None
            if only_migration and not (
                created and created.startswith(_HF_CREATED_AT_MIGRATION_PREFIX)
            ):
                skipped += 1
                continue
            if not _should_enrich(company.slug, model.name, created):
                skipped += 1
                continue

            model_id = _model_id_from_snapshot(data, company.slug, model.name)
            if not model_id:
                skipped += 1
                continue

            try:
                first = _first_commit_at(client, model_id)
            except Exception:
                logger.exception("commits fetch failed for %s", model_id)
                failed += 1
                continue
            if not first:
                failed += 1
                continue

            new_published = _earliest_iso(created, first)
            if not new_published or new_published == created:
                skipped += 1
                continue

            logger.info("%s: %s -> %s", model_id, created, new_published)
            updated += 1
            if dry_run:
                continue

            patched = deepcopy(data)
            if created:
                patched["hub_created_at"] = created
            patched["first_commit_at"] = first
            patched["published_at"] = new_published
            snapshot.data = patched

        if not dry_run:
            session.commit()

    return {
        "scanned": scanned,
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--only-migration",
        action="store_true",
        help="Only touch snapshots whose published_at starts with 2022-03-02",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    with SessionLocal() as session:
        result = backfill_hf_first_commits(
            session,
            limit=args.limit,
            dry_run=args.dry_run,
            only_migration=args.only_migration,
        )
    print(result)


if __name__ == "__main__":
    main()
