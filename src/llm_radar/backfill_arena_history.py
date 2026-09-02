from __future__ import annotations

import argparse
import logging
import tempfile
from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

import duckdb
import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from llm_radar.catalog import SOURCE_BY_SLUG
from llm_radar.collectors.arena import ARENA_SOURCE_URL
from llm_radar.database.models import BenchmarkDefinition, LeaderboardSnapshot, Source
from llm_radar.database.session import SessionLocal

logger = logging.getLogger(__name__)

ARENA_DATASET = "lmarena-ai/leaderboard-dataset"
ARENA_CONFIG = "text"
ARENA_HISTORY_SPLIT = "full"
ARENA_PARQUET_INDEX_URL = "https://datasets-server.huggingface.co/parquet"
DEFAULT_CATEGORY = "overall"
DEFAULT_BATCH_SIZE = 1_000


def _history_parquet_url(client: httpx.Client) -> str:
    response = client.get(ARENA_PARQUET_INDEX_URL, params={"dataset": ARENA_DATASET})
    response.raise_for_status()
    files = response.json().get("parquet_files", [])
    for item in files:
        if item.get("config") == ARENA_CONFIG and item.get("split") == ARENA_HISTORY_SPLIT:
            return str(item["url"])
    raise RuntimeError("Arena text/full Parquet file was not listed by Hugging Face")


def _download_history(client: httpx.Client, destination: Path) -> None:
    url = _history_parquet_url(client)
    with client.stream("GET", url) as response:
        response.raise_for_status()
        with destination.open("wb") as target:
            for chunk in response.iter_bytes():
                target.write(chunk)


def _history_rows(
    parquet_path: Path,
    *,
    category: str,
    since: date | None,
    batch_size: int,
) -> Iterator[list[dict[str, Any]]]:
    predicates = ["category = ?"]
    parameters: list[Any] = [str(parquet_path), category]
    if since is not None:
        predicates.append("CAST(leaderboard_publish_date AS DATE) >= ?")
        parameters.append(since)
    query = f"""
        SELECT
            model_name,
            organization,
            license,
            rating,
            rating_lower,
            rating_upper,
            vote_count,
            rank,
            category,
            leaderboard_publish_date
        FROM read_parquet(?)
        WHERE {" AND ".join(predicates)}
        ORDER BY CAST(leaderboard_publish_date AS DATE), rank, model_name
    """
    connection = duckdb.connect(database=":memory:")
    try:
        cursor = connection.execute(query, parameters)
        column_names = [item[0] for item in cursor.description]
        while batch := cursor.fetchmany(batch_size):
            yield [dict(zip(column_names, row, strict=True)) for row in batch]
    finally:
        connection.close()


def _source_and_benchmark(session: Session) -> tuple[Source, BenchmarkDefinition]:
    source = session.scalar(select(Source).where(Source.slug == "arena"))
    if source is None:
        spec = SOURCE_BY_SLUG["arena"]
        source = Source(
            name=spec.slug,
            slug=spec.slug,
            url=spec.url,
            source_type=spec.collection_method.value,
            category=spec.category.value,
            source_class=spec.source_class.value,
            collection_method=spec.collection_method.value,
            reliability_level=spec.reliability,
            check_interval_seconds=spec.check_interval_seconds,
            rate_limit_per_minute=spec.rate_limit_per_minute,
            auth_type=spec.auth_type,
            terms_url=spec.terms_url,
            is_active=spec.is_active,
        )
        session.add(source)
        session.flush()

    benchmark = session.scalar(
        select(BenchmarkDefinition).where(BenchmarkDefinition.slug == "arena-text")
    )
    if benchmark is None:
        benchmark = BenchmarkDefinition(
            source_id=source.id,
            slug="arena-text",
            name="Arena Text Leaderboard",
            category=DEFAULT_CATEGORY,
            methodology_url=ARENA_SOURCE_URL,
        )
        session.add(benchmark)
        session.flush()
    return source, benchmark


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _snapshot_values(
    row: dict[str, Any],
    *,
    benchmark_id: Any,
    source_id: Any,
    observed_at: datetime,
) -> dict[str, Any]:
    published_at = date.fromisoformat(str(row["leaderboard_publish_date"])[:10])
    raw_data = {
        "model_name": str(row["model_name"]),
        "organization": str(row["organization"]),
        "license": row.get("license"),
        "rating": float(row["rating"]),
        "rating_lower": float(row["rating_lower"]) if row.get("rating_lower") is not None else None,
        "rating_upper": float(row["rating_upper"]) if row.get("rating_upper") is not None else None,
        "vote_count": int(row["vote_count"]) if row.get("vote_count") is not None else None,
        "rank": int(row["rank"]),
        "category": str(row["category"]),
        "leaderboard_publish_date": published_at.isoformat(),
        "benchmark_slug": "arena-text",
        "benchmark_name": "Arena Text Leaderboard",
        "historical_backfill": True,
        "source_url": ARENA_SOURCE_URL,
    }
    return {
        "id": uuid4(),
        "benchmark_id": benchmark_id,
        "source_id": source_id,
        "model_external_id": raw_data["model_name"],
        "organization": raw_data["organization"],
        "license": raw_data["license"],
        "category": raw_data["category"],
        "rank": raw_data["rank"],
        "score": _decimal(row["rating"]) or Decimal("0"),
        "score_lower": _decimal(row.get("rating_lower")),
        "score_upper": _decimal(row.get("rating_upper")),
        "vote_count": raw_data["vote_count"],
        "published_at": published_at,
        "observed_at": observed_at,
        "raw_data": raw_data,
    }


def import_history(
    parquet_path: Path,
    *,
    category: str = DEFAULT_CATEGORY,
    since: date | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    dry_run: bool = False,
) -> tuple[int, int, date | None, date | None]:
    scanned = 0
    inserted = 0
    first_date: date | None = None
    last_date: date | None = None
    observed_at = datetime.now(UTC)
    with SessionLocal() as session:
        source, benchmark = _source_and_benchmark(session)
        count_query = select(func.count(LeaderboardSnapshot.id)).where(
            LeaderboardSnapshot.benchmark_id == benchmark.id,
            LeaderboardSnapshot.category == category,
        )
        if since is not None:
            count_query = count_query.where(LeaderboardSnapshot.published_at >= since)
        existing_count = session.scalar(count_query) or 0
        for rows in _history_rows(
            parquet_path,
            category=category,
            since=since,
            batch_size=batch_size,
        ):
            values = [
                _snapshot_values(
                    row,
                    benchmark_id=benchmark.id,
                    source_id=source.id,
                    observed_at=observed_at,
                )
                for row in rows
            ]
            scanned += len(values)
            dates = [value["published_at"] for value in values]
            first_date = min([item for item in [first_date, *dates] if item is not None])
            last_date = max([item for item in [last_date, *dates] if item is not None])
            if dry_run:
                continue
            statement = insert(LeaderboardSnapshot).values(values)
            statement = statement.on_conflict_do_nothing(
                constraint="uq_leaderboard_snapshot_identity"
            )
            session.execute(statement)
            session.commit()
        if not dry_run:
            final_count = session.scalar(count_query) or 0
            inserted = final_count - existing_count
            source.last_checked_at = observed_at
            source.last_success_at = observed_at
            source.last_error = None
            source.consecutive_failures = 0
            source.status = "active"
            session.commit()
    return scanned, inserted, first_date, last_date


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Backfill historical Arena Text leaderboard snapshots from Hugging Face."
    )
    parser.add_argument("--category", default=DEFAULT_CATEGORY)
    parser.add_argument("--since", type=date.fromisoformat)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main() -> None:
    args = _parser().parse_args()
    logging.basicConfig(level=logging.INFO)
    timeout = httpx.Timeout(300.0, connect=30.0)
    with tempfile.TemporaryDirectory(prefix="llm-radar-arena-") as directory:
        parquet_path = Path(directory) / "arena-text-full.parquet"
        logger.info("Downloading Arena text/full history")
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            _download_history(client, parquet_path)
        logger.info("Importing Arena category=%s", args.category)
        scanned, inserted, first_date, last_date = import_history(
            parquet_path,
            category=args.category,
            since=args.since,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )
    skipped = scanned - inserted if not args.dry_run else 0
    mode = "dry-run" if args.dry_run else "completed"
    print(
        f"Arena history {mode}: scanned={scanned}, inserted={inserted}, "
        f"skipped={skipped}, range={first_date}..{last_date}"
    )


if __name__ == "__main__":
    main()
