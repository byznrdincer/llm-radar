import httpx
import pytest
import respx

from llm_radar.collectors.swebench import SWEBENCH_RESULTS_URL, SweBenchCollector
from llm_radar.events.schemas import EventType, ReliabilityLevel


@pytest.mark.asyncio
@respx.mock
async def test_swebench_collector_ranks_verified_results() -> None:
    rows = [
        {
            "folder": "second",
            "name": "Agent B + Model B",
            "model_display": "Model B",
            "model_org": "Company B",
            "resolved": 70.0,
            "date": "2026-01-01",
            "warning": None,
            "os_model": False,
        },
        {
            "folder": "first",
            "name": "Agent A + Model A",
            "model_display": "Model A",
            "model_org": "Company A",
            "resolved": 80.0,
            "date": "2026-02-01",
            "warning": None,
            "os_model": True,
        },
    ]
    payload = {"leaderboards": [{"name": "Verified", "results": rows}]}
    respx.get(SWEBENCH_RESULTS_URL).mock(return_value=httpx.Response(200, json=payload))

    async with httpx.AsyncClient() as client:
        result = await SweBenchCollector(client).collect()

    first = result.events[0]
    assert first.event_type == EventType.LEADERBOARD_CHANGED
    assert first.payload["model_name"] == "Model A"
    assert first.payload["rank"] == 1
    assert first.payload["rating"] == 80.0
    assert first.payload["leaderboard_publish_date"] == "2026-02-01"
    assert first.metadata.reliability == ReliabilityLevel.INDEPENDENT_MEASUREMENT
