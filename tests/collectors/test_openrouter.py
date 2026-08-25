from decimal import Decimal

import httpx
import pytest

from llm_radar.collectors.openrouter import OPENROUTER_MODELS_URL, OpenRouterCollector


@pytest.mark.asyncio
async def test_openrouter_collector_normalizes_prices_per_million() -> None:
    payload = {
        "data": [
            {
                "id": "example/model",
                "name": "Example Model",
                "context_length": 128000,
                "architecture": {
                    "input_modalities": ["text"],
                    "output_modalities": ["text"],
                    "tokenizer": "Example",
                },
                "pricing": {"prompt": "0.000001", "completion": "0.000002"},
            }
        ]
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == OPENROUTER_MODELS_URL
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await OpenRouterCollector(client).collect()

    event = result.events[0]
    assert event.entity_key == "example/model"
    assert Decimal(event.payload["pricing"]["input_per_1m_tokens"]) == Decimal("1")
    assert Decimal(event.payload["pricing"]["output_per_1m_tokens"]) == Decimal("2")
