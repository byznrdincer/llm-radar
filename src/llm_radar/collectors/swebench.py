from datetime import UTC, datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.events.schemas import EventEnvelope, EventMetadata, EventType, ReliabilityLevel

SWEBENCH_RESULTS_URL = (
    "https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json"
)
SWEBENCH_SOURCE_URL = "https://www.swebench.com/"


class SweBenchCollector(BaseCollector):
    name = "swe-bench"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(SWEBENCH_RESULTS_URL)
        response.raise_for_status()
        raw_payload: dict[str, Any] = response.json()
        collected_at = datetime.now(UTC)
        verified = next(
            board
            for board in raw_payload.get("leaderboards", [])
            if str(board.get("name", "")).lower() == "verified"
        )
        results = [row for row in verified.get("results", []) if not row.get("warning")]
        results.sort(key=lambda row: float(row.get("resolved") or 0), reverse=True)
        best_by_model: dict[str, dict[str, Any]] = {}
        for row in results:
            model_name = str(row.get("model_display") or row.get("name") or row["folder"])
            best_by_model.setdefault(model_name, row)
        results = list(best_by_model.values())
        snapshot_date = max(
            (str(row["date"]) for row in results if row.get("date")),
            default=collected_at.date().isoformat(),
        )
        events = [
            self._to_event(row, rank, snapshot_date, collected_at)
            for rank, row in enumerate(results, start=1)
        ]
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(
        self,
        row: dict[str, Any],
        rank: int,
        snapshot_date: str,
        collected_at: datetime,
    ) -> EventEnvelope:
        model_name = str(row.get("model_display") or row.get("name") or row["folder"])
        organization = str(row.get("model_org") or row.get("agent_org") or "Unknown")
        payload = {
            "benchmark_slug": "swe-bench-verified",
            "benchmark_name": "SWE-bench Verified",
            "model_name": model_name,
            "submission_name": row.get("name"),
            "organization": organization,
            "license": "Open" if row.get("os_model") else "Proprietary",
            "category": "coding_agent",
            "rating": row.get("resolved"),
            "rating_lower": None,
            "rating_upper": None,
            "vote_count": None,
            "rank": rank,
            "leaderboard_publish_date": snapshot_date,
            "evaluation_date": row.get("date"),
            "agent": row.get("agent"),
            "agent_organization": row.get("agent_org"),
            "reasoning_effort": row.get("reasoning_effort"),
            "verified": row.get("checked"),
            "open_system": row.get("os_system"),
            "cost": row.get("cost"),
            "source_site": row.get("site"),
            "folder": row.get("folder"),
        }
        return EventEnvelope(
            event_type=EventType.LEADERBOARD_CHANGED,
            source=self.name,
            entity_key=f"swe-bench/verified/{row['folder']}",
            occurred_at=datetime.fromisoformat(snapshot_date).replace(tzinfo=UTC),
            collected_at=collected_at,
            payload=payload,
            metadata=EventMetadata(
                source_url=SWEBENCH_SOURCE_URL,
                reliability=ReliabilityLevel.INDEPENDENT_MEASUREMENT,
            ),
        )
