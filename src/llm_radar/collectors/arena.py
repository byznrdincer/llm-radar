from datetime import UTC, datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.events.schemas import EventEnvelope, EventMetadata, EventType, ReliabilityLevel

ARENA_ROWS_URL = "https://datasets-server.huggingface.co/rows"
ARENA_SOURCE_URL = "https://arena.ai/leaderboard/text"


class ArenaCollector(BaseCollector):
    name = "arena"

    async def collect(self) -> CollectorResult:
        params: dict[str, str | int] = {
            "dataset": "lmarena-ai/leaderboard-dataset",
            "config": "text",
            "split": "latest",
            "offset": 0,
            "length": 100,
        }
        response = await self.client.get(ARENA_ROWS_URL, params=params)
        response.raise_for_status()
        raw_payload: dict[str, Any] = response.json()
        collected_at = datetime.now(UTC)
        rows = [item["row"] for item in raw_payload.get("rows", [])]
        events = [self._to_event(row, collected_at) for row in rows]
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(self, row: dict[str, Any], collected_at: datetime) -> EventEnvelope:
        payload = {
            **row,
            "benchmark_slug": "arena-text",
            "benchmark_name": "Arena Text Leaderboard",
        }
        return EventEnvelope(
            event_type=EventType.LEADERBOARD_CHANGED,
            source=self.name,
            entity_key=f"arena/text/{row['category']}/{row['model_name']}",
            occurred_at=datetime.fromisoformat(row["leaderboard_publish_date"]).replace(tzinfo=UTC),
            collected_at=collected_at,
            payload=payload,
            metadata=EventMetadata(
                source_url=ARENA_SOURCE_URL,
                reliability=ReliabilityLevel.INDEPENDENT_MEASUREMENT,
            ),
        )
