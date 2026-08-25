import httpx
import pytest
import respx

from llm_radar.collectors.artificial_analysis import (
    ARTIFICIAL_ANALYSIS_MODELS_URL,
    ArtificialAnalysisCollector,
)
from llm_radar.events.schemas import EventType, ReliabilityLevel


def test_artificial_analysis_collector_requires_api_key() -> None:
    with pytest.raises(ValueError, match="ARTIFICIAL_ANALYSIS_API_KEY"):
        ArtificialAnalysisCollector(httpx.AsyncClient(), "")


@pytest.mark.asyncio
@respx.mock
async def test_artificial_analysis_collector_emits_ranked_category_events() -> None:
    data = [
        {
            "id": "model-a",
            "name": "Model A",
            "slug": "model-a",
            "model_creator": {"name": "Company A"},
            "evaluations": {
                "artificial_analysis_intelligence_index": 50,
                "artificial_analysis_coding_index": 60,
                "artificial_analysis_agentic_index": 40,
            },
            "pricing": {"price_1m_input_tokens": 1},
            "performance": {"median_output_tokens_per_second": 100},
        },
        {
            "id": "model-b",
            "name": "Model B",
            "slug": "model-b",
            "model_creator": {"name": "Company B"},
            "evaluations": {
                "artificial_analysis_intelligence_index": 70,
                "artificial_analysis_coding_index": 55,
                "artificial_analysis_agentic_index": 65,
            },
        },
    ]
    payload = {
        "intelligence_index_version": 4.1,
        "pagination": {"has_more": False},
        "data": data,
    }
    respx.get(ARTIFICIAL_ANALYSIS_MODELS_URL).mock(return_value=httpx.Response(200, json=payload))

    async with httpx.AsyncClient() as client:
        result = await ArtificialAnalysisCollector(client, "secret").collect()

    assert len(result.events) == 6
    first = result.events[0]
    assert first.event_type == EventType.LEADERBOARD_CHANGED
    assert first.payload["benchmark_slug"] == "artificial-analysis-intelligence"
    assert first.payload["benchmark_version"] == "4.1"
    assert first.payload["model_name"] == "Model B"
    assert first.payload["rank"] == 1
    assert first.metadata.reliability == ReliabilityLevel.INDEPENDENT_MEASUREMENT
