from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import duckdb

from llm_radar.backfill_arena_history import _history_rows, _snapshot_values


def test_history_rows_filters_category_and_start_date(tmp_path) -> None:  # type: ignore[no-untyped-def]
    parquet_path = tmp_path / "arena.parquet"
    connection = duckdb.connect(database=":memory:")
    connection.execute(
        """
        CREATE TABLE snapshots (
            model_name VARCHAR,
            organization VARCHAR,
            license VARCHAR,
            rating DOUBLE,
            rating_lower DOUBLE,
            rating_upper DOUBLE,
            vote_count DOUBLE,
            rank DOUBLE,
            category VARCHAR,
            leaderboard_publish_date VARCHAR
        )
        """
    )
    connection.executemany(
        "INSERT INTO snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("old", "openai", "Proprietary", 1200, 1190, 1210, 100, 1, "overall", "2024-01-01"),
            ("keep", "qwen", "Apache-2.0", 1300, 1290, 1310, 200, 1, "overall", "2024-02-01"),
            ("coding", "qwen", "Apache-2.0", 1400, 1390, 1410, 300, 1, "coding", "2024-02-01"),
        ],
    )
    connection.table("snapshots").write_parquet(str(parquet_path))
    connection.close()

    batches = list(
        _history_rows(
            parquet_path,
            category="overall",
            since=date(2024, 2, 1),
            batch_size=1,
        )
    )

    assert [[row["model_name"] for row in batch] for batch in batches] == [["keep"]]


def test_snapshot_values_preserves_provenance_and_numeric_fields() -> None:
    benchmark_id = uuid4()
    source_id = uuid4()
    observed_at = datetime(2026, 9, 2, tzinfo=UTC)

    values = _snapshot_values(
        {
            "model_name": "model-a",
            "organization": "openai",
            "license": "Proprietary",
            "rating": 1500.5,
            "rating_lower": 1490.25,
            "rating_upper": 1510.75,
            "vote_count": 1234.0,
            "rank": 1.0,
            "category": "overall",
            "leaderboard_publish_date": "2024-01-09",
        },
        benchmark_id=benchmark_id,
        source_id=source_id,
        observed_at=observed_at,
    )

    assert values["score"] == Decimal("1500.5")
    assert values["published_at"] == date(2024, 1, 9)
    assert values["raw_data"]["historical_backfill"] is True
    assert values["raw_data"]["source_url"] == "https://arena.ai/leaderboard/text"
