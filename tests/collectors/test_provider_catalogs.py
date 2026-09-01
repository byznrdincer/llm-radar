from decimal import Decimal

import httpx
import pytest

from llm_radar.collectors.aimlapi import AIMLAPI_MODELS_URL, AIMLAPICollector
from llm_radar.collectors.groqcloud import GROQ_MODELS_URL, GroqCloudCollector
from llm_radar.collectors.litellm import LiteLLMCollector
from llm_radar.collectors.model_catalog import canonical_model_key, price_per_million
from llm_radar.collectors.nanogpt import NanoGPTCollector
from llm_radar.collectors.replicate import REPLICATE_MODELS_URL, ReplicateCollector
from llm_radar.collectors.vercel_gateway import VERCEL_MODELS_URL, VercelGatewayCollector


def test_catalog_helpers_normalize_owner_and_price_units() -> None:
    assert canonical_model_key("gpt-5", "Open AI") == "openai/gpt-5"
    assert canonical_model_key("Qwen/Qwen3", "ignored") == "qwen/qwen3"
    assert price_per_million("0.000002") == "2.000000"
    assert price_per_million("2", unit="per_million_tokens") == "2"
    assert price_per_million("-1") is None


@pytest.mark.asyncio
async def test_vercel_gateway_maps_capabilities_and_per_token_prices() -> None:
    payload = {
        "object": "list",
        "data": [
            {
                "id": "openai/gpt-test",
                "type": "language",
                "owned_by": "openai",
                "name": "GPT Test",
                "context_window": 128000,
                "max_tokens": 32000,
                "tags": ["reasoning", "tool-use"],
                "modalities": {"input": ["text", "image"], "output": ["text"]},
                "supported_parameters": ["tools", "reasoning", "response_format"],
                "pricing": {"input": "0.000001", "output": "0.000004"},
            }
        ],
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == VERCEL_MODELS_URL
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await VercelGatewayCollector(client).collect()

    event = result.events[0]
    assert event.entity_key == "openai/gpt-test"
    assert event.payload["supports_tool_calling"] is True
    assert event.payload["supports_structured_output"] is True
    assert event.payload["supports_reasoning"] is True
    assert Decimal(event.payload["pricing"]["input_per_1m_tokens"]) == 1


@pytest.mark.asyncio
async def test_aimlapi_maps_documented_feature_names() -> None:
    payload = {
        "object": "list",
        "data": [
            {
                "id": "o3-mini",
                "type": "chat-completion",
                "info": {
                    "name": "o3 mini",
                    "developer": "Open AI",
                    "contextLength": 200000,
                    "maxTokens": 100000,
                },
                "features": [
                    "openai/chat-completion.function",
                    "openai/chat-completion.reasoning",
                    "openai/chat-completion.response-format",
                    "openai/chat-completion.stream",
                ],
            },
            {
                "id": "o3-mini",
                "type": "openai/responses/submit",
                "info": {"name": "o3 mini", "developer": "Open AI"},
            },
            {
                "id": "image-model",
                "type": "openai/image-generations",
                "info": {"name": "Image Model", "developer": "Open AI"},
            },
        ],
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == AIMLAPI_MODELS_URL
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await AIMLAPICollector(client).collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "openai/o3-mini"
    assert event.payload["context_window"] == 200000
    assert event.payload["supports_tool_calling"] is True
    assert event.payload["supports_streaming"] is True


@pytest.mark.asyncio
async def test_nanogpt_keeps_documented_per_million_price_unit() -> None:
    payload = {
        "object": "list",
        "data": [
            {
                "id": "anthropic/claude-test",
                "owned_by": "anthropic",
                "name": "Claude Test",
                "context_length": 200000,
                "max_output_tokens": 32000,
                "capabilities": {
                    "vision": True,
                    "reasoning": True,
                    "tool_calling": True,
                    "structured_output": False,
                },
                "pricing": {
                    "prompt": 3,
                    "completion": 15,
                    "currency": "USD",
                    "unit": "per_million_tokens",
                },
            }
        ],
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/models"
        assert request.url.params["detailed"] == "true"
        assert request.headers["Authorization"] == "Bearer nano-secret"
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await NanoGPTCollector(client, "nano-secret").collect()

    event = result.events[0]
    assert event.entity_key == "anthropic/claude-test"
    assert event.payload["input_modalities"] == ["text", "image"]
    assert event.payload["pricing"]["input_per_1m_tokens"] == "3"


@pytest.mark.asyncio
async def test_litellm_paginates_and_rejects_hosting_aliases() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/model_catalog"
        page = int(request.url.params["page"])
        if page == 1:
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "gpt-test",
                            "provider": "openai",
                            "mode": "chat",
                            "max_input_tokens": 128000,
                            "max_output_tokens": 16000,
                            "input_cost_per_token": "0.000001",
                            "output_cost_per_token": "0.000002",
                            "supports_function_calling": True,
                        }
                    ],
                    "has_more": True,
                },
            )
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "anthropic.claude-via-bedrock",
                        "provider": "bedrock",
                        "mode": "chat",
                    },
                    {"id": "dall-e", "provider": "openai", "mode": "image_generation"},
                ],
                "has_more": False,
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await LiteLLMCollector(client).collect()

    assert len(result.events) == 1
    assert result.events[0].entity_key == "openai/gpt-test"
    assert result.events[0].payload["supports_tool_calling"] is True


@pytest.mark.asyncio
async def test_groqcloud_requires_auth_and_uses_model_owner() -> None:
    payload = {
        "data": [
            {
                "id": "llama-test",
                "owned_by": "Meta",
                "active": True,
                "context_window": 131072,
                "max_completion_tokens": 32768,
            }
        ]
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == GROQ_MODELS_URL
        assert request.headers["Authorization"] == "Bearer groq-secret"
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await GroqCloudCollector(client, "groq-secret").collect()

    event = result.events[0]
    assert event.entity_key == "meta/llama-test"
    assert event.payload["provider"] == "groqcloud"
    assert "supports_tool_calling" not in event.payload


@pytest.mark.asyncio
async def test_replicate_follows_pagination_and_keeps_open_weight_evidence() -> None:
    second_page = f"{REPLICATE_MODELS_URL}?cursor=next"

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer replicate-secret"
        if "cursor" not in request.url.params:
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "owner": "meta",
                            "name": "llama-test",
                            "url": "https://replicate.com/meta/llama-test",
                            "weights_url": "https://huggingface.co/meta-llama/llama-test",
                            "license_url": "https://choosealicense.com/licenses/mit/",
                            "latest_version": {
                                "id": "version-1",
                                "openapi_schema": {
                                    "components": {
                                        "schemas": {
                                            "Input": {
                                                "properties": {
                                                    "prompt": {"type": "string"},
                                                    "system_prompt": {"type": "string"},
                                                    "max_tokens": {"type": "integer"},
                                                }
                                            }
                                        }
                                    }
                                },
                            },
                        }
                    ],
                    "next": second_page,
                },
            )
        return httpx.Response(200, json={"results": [], "next": None})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await ReplicateCollector(client, "replicate-secret").collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "meta/llama-test"
    assert event.payload["availability"] == "open_weight"
    assert event.payload["license"] == "MIT"
    assert len(result.raw_payload["pages"]) == 2
