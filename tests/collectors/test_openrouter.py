from decimal import Decimal

import httpx
import pytest

from llm_radar.collectors.openrouter import (
    OPENROUTER_MODELS_URL,
    OpenRouterCollector,
    _per_token_to_per_million,
)


def test_openrouter_negative_price_sentinel_is_unknown() -> None:
    assert _per_token_to_per_million("-1") is None


@pytest.mark.asyncio
async def test_openrouter_collector_normalizes_prices_per_million() -> None:
    payload = {
        "data": [
            {
                "id": "example/model",
                "name": "Example Model",
                "created": 1_735_689_600,
                "context_length": 128000,
                "architecture": {
                    "input_modalities": ["text"],
                    "output_modalities": ["text"],
                    "tokenizer": "Example",
                },
                "pricing": {"prompt": "0.000001", "completion": "0.000002"},
                "top_provider": {"max_completion_tokens": 8192},
                "supported_parameters": ["tools", "tool_choice", "reasoning", "response_format"],
                "reasoning": {"default_enabled": True},
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
    assert event.payload["max_output_tokens"] == 8192
    assert event.payload["supports_tool_calling"] is True
    assert event.payload["supports_reasoning"] is True
    assert event.payload["supports_structured_output"] is True
    assert event.payload["supports_streaming"] is None
    assert event.payload["release_date"] == "2025-01-01"
