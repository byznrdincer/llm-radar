import json
from datetime import UTC, datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.community_benchmarks import leaderboard_event

DATA_URL = "https://swe-bench-live.github.io/reports-0605.jsonl"
SOURCE_URL = "https://swe-bench-live.github.io/"


class SweBenchLiveCollector(BaseCollector):
    name = "swe-bench-live"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(DATA_URL)
        response.raise_for_status()
        rows: list[dict[str, Any]] = [
            json.loads(line) for line in response.text.splitlines() if line.strip()
        ]
        events = []
        for split in sorted({str(row.get("set", "")).lower() for row in rows if row.get("set")}):
            split_rows = [
                row for row in rows if str(row.get("set", "")).lower() == split and row.get("total")
            ]
            snapshot_date = max(
                (str(row.get("date")) for row in split_rows if row.get("date")),
                default=datetime.now(UTC).date().isoformat(),
            )
            scored = sorted(
                (
                    (
                        row,
                        (
                            len(row["resolved"])
                            if isinstance(row.get("resolved"), list)
                            else int(row.get("resolved", 0))
                        )
                        / int(row["total"])
                        * 100,
                    )
                    for row in split_rows
                ),
                key=lambda item: item[1],
                reverse=True,
            )
            for rank, (row, score) in enumerate(scored, start=1):
                events.append(
                    leaderboard_event(
                        source=self.name,
                        slug=f"swe-bench-live-{split}",
                        name=f"SWE-bench Live {split.title()}",
                        category=split,
                        model=row["name"],
                        score=score,
                        rank=rank,
                        published=snapshot_date,
                        source_url=SOURCE_URL,
                        raw={
                            "resolved": row.get("resolved"),
                            "total": row["total"],
                            "submission_date": row.get("date"),
                            "submission_url": row.get("url"),
                            "agent_harness": row.get("logo"),
                            "prompt_method": "official SWE-bench Live submission protocol",
                        },
                    )
                )
        return CollectorResult(events=events, raw_payload=rows)
