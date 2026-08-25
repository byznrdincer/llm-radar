from datetime import UTC, datetime

import httpx
import pytest
import respx

from llm_radar.collectors.arena import ARENA_ROWS_URL, ArenaCollector
from llm_radar.events.schemas import EventType, ReliabilityLevel


@pytest.mark.asyncio
@respx.mock
async def test_arena_collector_creates_source_backed_leaderboard_event() -> None:
    row = {
        "model_name": "model-a",
        "organization": "company-a",
        "license": "Proprietary",
        "rating": 1500.5,
        "rating_lower": 1490.0,
        "rating_upper": 1510.0,
        "vote_count": 1000.0,
        "rank": 1.0,
        "category": "overall",
        "leaderboard_publish_date": "2026-08-12",
    }
    respx.get(ARENA_ROWS_URL).mock(return_value=httpx.Response(200, json={"rows": [{"row": row}]}))

    async with httpx.AsyncClient() as client:
        result = await ArenaCollector(client).collect()

    event = result.events[0]
    assert event.event_type == EventType.LEADERBOARD_CHANGED
    assert event.entity_key == "arena/text/overall/model-a"
    assert event.payload["rank"] == 1.0
    assert event.metadata.reliability == ReliabilityLevel.INDEPENDENT_MEASUREMENT
    assert event.occurred_at == datetime(2026, 8, 12, tzinfo=UTC)
