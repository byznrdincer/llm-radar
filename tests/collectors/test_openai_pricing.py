import httpx
import pytest

from llm_radar.collectors.openai_pricing import (
    OPENAI_PRICING_URL,
    OpenAIPricingCollector,
    parse_standard_pricing,
)

MARKDOWN = """
# Pricing
### Standard pricing data
| Model | Input | Cached input | Cache writes | Output | Long input |
| --- | --- | --- | --- | --- | --- |
| gpt-test (<272K context length) | $2.50 | $0.25 | - | $15.00 | $5.00 |
| gpt-test-mini | $0.10 | - | - | $0.40 | - |
### Batch pricing data
| Model | Input | Output |
| --- | --- | --- |
| should-not-appear | $1 | $2 |
"""


def test_parse_standard_openai_prices() -> None:
    assert parse_standard_pricing(MARKDOWN) == [
        {
            "model_id": "gpt-test",
            "input": "2.50",
            "cache_read": "0.25",
            "output": "15.00",
        },
        {
            "model_id": "gpt-test-mini",
            "input": "0.10",
            "cache_read": None,
            "output": "0.40",
        },
    ]


@pytest.mark.asyncio
async def test_openai_pricing_collector_emits_official_model_events() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == OPENAI_PRICING_URL
        return httpx.Response(200, text=MARKDOWN)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await OpenAIPricingCollector(client).collect()

    assert len(result.events) == 2
    event = result.events[0]
    assert event.entity_key == "openai/gpt-test"
    assert event.payload["pricing"]["input_per_1m_tokens"] == "2.50"
    assert event.metadata.reliability.value == "official_document"
