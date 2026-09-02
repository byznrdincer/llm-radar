from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from llm_radar.collectors.aimlapi import AIMLAPI_MODELS_URL, AIMLAPICollector
from llm_radar.collectors.bifrost import BIFROST_DATASHEET_URL, BifrostCollector
from llm_radar.collectors.cloudflare_workers_ai import (
    CLOUDFLARE_PUBLIC_MODELS_URL,
    CloudflareWorkersAICollector,
    cloudflare_models_url,
)
from llm_radar.collectors.deepinfra import DEEPINFRA_MODELS_URL, DeepInfraCollector
from llm_radar.collectors.fireworks import (
    FIREWORKS_PUBLIC_MODELS_URL,
    FireworksCollector,
)
from llm_radar.collectors.groqcloud import GROQ_MODELS_URL, GroqCloudCollector
from llm_radar.collectors.litellm import LiteLLMCollector
from llm_radar.collectors.model_catalog import canonical_model_key, price_per_million
from llm_radar.collectors.nanogpt import NanoGPTCollector
from llm_radar.collectors.replicate import REPLICATE_MODELS_URL, ReplicateCollector
from llm_radar.collectors.together import TOGETHER_MODELS_URL, TogetherCollector
from llm_radar.collectors.vercel_gateway import VERCEL_MODELS_URL, VercelGatewayCollector


def test_catalog_helpers_normalize_owner_and_price_units() -> None:
    assert canonical_model_key("gpt-5", "Open AI") == "openai/gpt-5"
    assert canonical_model_key("Qwen/Qwen3", "ignored") == "qwen/qwen3"
    assert price_per_million("0.000002") == "2.000000"
    assert price_per_million("2", unit="per_million_tokens") == "2"
    assert price_per_million("-1") is None


@pytest.mark.asyncio
async def test_together_maps_documented_model_metadata_and_filters_non_llms() -> None:
    payload = [
        {
            "id": "meta-llama/Llama-Test",
            "object": "model",
            "created": 1692896905,
            "type": "chat",
            "display_name": "Llama Test",
            "organization": "Meta",
            "link": "https://huggingface.co/meta-llama/Llama-Test",
            "license": "llama3.1",
            "context_length": 131072,
            "pricing": {
                "input": 0.18,
                "output": 0.18,
                "cached_input": 0.09,
                "hourly": 0,
                "base": 0,
                "finetune": 0,
            },
        },
        {
            "id": "black-forest-labs/image-test",
            "object": "model",
            "created": 1692896905,
            "type": "image",
            "organization": "Black Forest Labs",
            "pricing": {},
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == TOGETHER_MODELS_URL
        assert request.headers["Authorization"] == "Bearer together-secret"
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await TogetherCollector(client, "together-secret").collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "meta/llama-test"
    assert event.payload["provider"] == "together"
    assert event.payload["context_window"] == 131072
    assert event.payload["availability"] == "open_weight"
    assert event.payload["open_weight_evidence"]["model_url"].startswith("https://huggingface.co/")
    assert Decimal(event.payload["pricing"]["input_per_1m_tokens"]) == Decimal("0.18")
    assert Decimal(event.payload["pricing"]["cache_read_per_1m_tokens"]) == Decimal("0.09")
    assert "supports_tool_calling" not in event.payload


@pytest.mark.asyncio
async def test_together_does_not_guess_openness_without_evidence() -> None:
    async with httpx.AsyncClient() as client:
        collector = TogetherCollector(client, "together-secret")
        event = collector._to_event(
            {
                "id": "anthropic/closed-test",
                "type": "chat",
                "organization": "Anthropic",
                "license": "proprietary",
                "link": "https://www.together.ai/models/closed-test",
                "pricing": {},
            },
            datetime.now(UTC),
        )
    assert event is not None
    assert "availability" not in event.payload
    assert "is_open_weight" not in event.payload


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


@pytest.mark.asyncio
async def test_deepinfra_maps_token_prices_and_filters_non_llms() -> None:
    payload = [
        {
            "model_name": "meta-llama/Llama-Test",
            "type": "text-generation",
            "reported_type": "text-generation",
            "description": "A language model",
            "tags": ["openai", "multimodal"],
            "max_tokens": 131072,
            "pricing": {
                "type": "tokens",
                "cents_per_input_token": "0.00003",
                "cents_per_output_token": "0.00005",
                "discount": 0.1,
            },
        },
        {
            "model_name": "black-forest-labs/image-test",
            "type": "text-to-image",
            "reported_type": "text-to-image",
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == DEEPINFRA_MODELS_URL
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await DeepInfraCollector(client).collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "meta/llama-test"
    assert event.payload["provider"] == "deepinfra"
    assert event.payload["input_modalities"] == ["text", "image"]
    assert Decimal(event.payload["pricing"]["input_per_1m_tokens"]) == Decimal("0.27")
    assert "is_open_weight" not in event.payload


@pytest.mark.asyncio
async def test_fireworks_paginates_and_uses_huggingface_as_weight_evidence() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/accounts/fireworks/models"
        assert request.headers["Authorization"] == "Bearer fireworks-secret"
        assert request.url.params["filter"] == "supports_serverless=true"
        if "pageToken" not in request.url.params:
            return httpx.Response(
                200,
                json={
                    "models": [
                        {
                            "name": "accounts/fireworks/models/llama-test",
                            "displayName": "Llama Test",
                            "conversationConfig": {},
                            "contextLength": 131072,
                            "supportsImageInput": True,
                            "supportsTools": True,
                            "huggingFaceUrl": "https://huggingface.co/meta-llama/Llama-Test",
                        }
                    ],
                    "nextPageToken": "next",
                },
            )
        assert request.url.params["pageToken"] == "next"
        return httpx.Response(
            200,
            json={
                "models": [
                    {
                        "name": "accounts/fireworks/models/image-only",
                        "baseModelDetails": {"modelType": "image"},
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await FireworksCollector(client, "fireworks-secret").collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "meta/llama-test"
    assert event.payload["supports_tool_calling"] is True
    assert event.payload["availability"] == "open_weight"
    assert event.payload["open_weight_evidence"]["weights_url"].startswith(
        "https://huggingface.co/"
    )
    assert len(result.raw_payload["pages"]) == 2


@pytest.mark.asyncio
async def test_fireworks_uses_public_catalog_without_api_key() -> None:
    html = """
    <html><body>
      <a data-testid="model-card" href="/models/fireworks/qwen-test">
        <img alt="Qwen" />
        <span class="truncate font-medium text-base">Qwen Test</span>
        <span>LLM</span><span>Context 262k</span>
        <div data-sentry-component="ModelCapabilityLabel">Serverless</div>
        <div data-sentry-component="ModelCapabilityLabel">Function-calling</div>
        <div data-sentry-component="ModelCapabilityLabel">Reasoning</div>
        <div data-sentry-component="ModelCapabilityLabel">Vision</div>
        <div class="space-x-1"><span>$0.22/M</span><span>uncached</span></div>
        <div class="space-x-1"><span>$0.06/M</span><span>cached</span></div>
        <div class="space-x-1"><span>$0.88/M</span><span>output</span></div>
      </a>
      <a data-testid="model-card" href="/models/fireworks/image-test">
        <img alt="Fireworks" /><span>Image</span>
      </a>
    </body></html>
    """

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == FIREWORKS_PUBLIC_MODELS_URL
        assert "Authorization" not in request.headers
        return httpx.Response(200, text=html)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await FireworksCollector(client).collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "qwen/qwen-test"
    assert event.payload["context_window"] == 262_000
    assert event.payload["input_modalities"] == ["text", "image"]
    assert event.payload["supports_tool_calling"] is True
    assert event.payload["supports_reasoning"] is True
    assert Decimal(event.payload["pricing"]["input_per_1m_tokens"]) == Decimal("0.22")
    assert event.metadata.extraction_method == "html"


@pytest.mark.asyncio
async def test_cloudflare_maps_openrouter_format_and_filters_non_text_models() -> None:
    account_id = "account-123"
    payload = {
        "success": True,
        "result": {
            "data": [
                {
                    "id": "meta/llama-test",
                    "name": "Llama Test",
                    "context_length": 131072,
                    "architecture": {
                        "input_modalities": ["text", "image"],
                        "output_modalities": ["text"],
                    },
                    "supported_parameters": ["tools", "response_format"],
                    "pricing": {"prompt": "0.000001", "completion": "0.000003"},
                },
                {
                    "id": "stability/image-test",
                    "architecture": {
                        "input_modalities": ["text"],
                        "output_modalities": ["image"],
                    },
                },
            ]
        },
        "result_info": {"page": 1, "total_pages": 1},
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url).startswith(cloudflare_models_url(account_id))
        assert request.headers["Authorization"] == "Bearer cloudflare-secret"
        assert request.url.params["format"] == "openrouter"
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await CloudflareWorkersAICollector(
            client, account_id, "cloudflare-secret"
        ).collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "meta/llama-test"
    assert event.payload["provider"] == "cloudflare-workers-ai"
    assert event.payload["supports_tool_calling"] is True
    assert Decimal(event.payload["pricing"]["input_per_1m_tokens"]) == Decimal("1")
    assert "is_open_weight" not in event.payload


@pytest.mark.asyncio
async def test_cloudflare_uses_public_catalog_without_credentials() -> None:
    html = """
    <html><body>
      <a href="/workers-ai/models/llama-test/">
        <h3>llama-test</h3>
        <div class="border-t"><span>Meta</span><span>Text Generation</span></div>
        <p>A test language model.</p>
        <ul><li><span>Cloudflare-hosted</span></li><li><span>Reasoning</span></li></ul>
      </a>
      <a href="/workers-ai/models/image-test/">
        <h3>image-test</h3>
        <div class="border-t"><span>Stability AI</span><span>Text-to-Image</span></div>
      </a>
    </body></html>
    """

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == CLOUDFLARE_PUBLIC_MODELS_URL
        assert "Authorization" not in request.headers
        return httpx.Response(200, text=html)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await CloudflareWorkersAICollector(client).collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "meta/llama-test"
    assert event.payload["description"] == "A test language model."
    assert event.payload["supports_reasoning"] is True
    assert "supports_tool_calling" not in event.payload
    assert event.metadata.extraction_method == "html"


@pytest.mark.asyncio
async def test_bifrost_keeps_direct_llms_and_rejects_hosting_aliases() -> None:
    payload = {
        "openai/gpt-test": {
            "provider": "openai",
            "mode": "chat",
            "input_cost_per_token": "0.000001",
            "output_cost_per_token": "0.000004",
            "max_input_tokens": 128000,
            "supported_modalities": ["text", "image"],
            "supported_output_modalities": ["text"],
            "supports_function_calling": True,
            "supports_reasoning": True,
        },
        "openai/gpt-test-alias": {
            "provider": "openai",
            "base_model": "openai/gpt-test",
            "mode": "chat",
            "input_cost_per_token": "0.000002",
            "output_cost_per_token": "0.000008",
            "supported_modalities": ["text"],
            "supported_output_modalities": ["text"],
        },
        "bedrock/anthropic.claude-test": {
            "provider": "bedrock",
            "mode": "chat",
        },
        "openai/dall-e-test": {
            "provider": "openai",
            "mode": "image_generation",
        },
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == BIFROST_DATASHEET_URL
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BifrostCollector(client).collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.entity_key == "openai/gpt-test"
    assert event.payload["provider"] == "bifrost"
    assert event.payload["supports_tool_calling"] is True
    assert event.payload["supports_reasoning"] is True
    assert Decimal(event.payload["pricing"]["output_per_1m_tokens"]) == Decimal("4")
    assert event.payload["external_id"] == "openai/gpt-test"
    assert "is_open_weight" not in event.payload
