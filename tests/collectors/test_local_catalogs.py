import httpx
import pytest

from llm_radar.collectors.lmstudio import LMStudioCollector
from llm_radar.collectors.ollama import OllamaCollector


@pytest.mark.asyncio
async def test_ollama_collector_parses_library_and_tags() -> None:
    library_html = '<a href="/library/llama3.2">llama3.2</a><a href="/library/qwen2.5">qwen2.5</a>'
    tags_payload = {
        "models": [
            {
                "name": "llama3.2:latest",
                "details": {
                    "family": "llama",
                    "parameter_size": "3B",
                    "quantization_level": "Q4_K_M",
                },
            }
        ]
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/library":
            return httpx.Response(200, text=library_html)
        if request.url.path == "/api/tags":
            return httpx.Response(200, json=tags_payload)
        raise AssertionError(request.url)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://ollama.com"
    ) as client:
        result = await OllamaCollector(client).collect()

    assert len(result.events) == 2
    llama = next(event for event in result.events if event.entity_key == "ollama/llama3.2")
    assert llama.payload["ollama_compatible"] is True
    assert llama.payload["local_runnable"] is True
    assert llama.payload["family"] == "llama"


@pytest.mark.asyncio
async def test_lmstudio_collector_parses_model_links() -> None:
    html = '<a href="/models/deepseek-r1">DeepSeek R1</a><a href="/models/gemma-3">Gemma 3</a>'

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/models"
        return httpx.Response(200, text=html)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://lmstudio.ai"
    ) as client:
        result = await LMStudioCollector(client).collect()

    assert len(result.events) == 2
    assert result.events[0].payload["lm_studio_compatible"] is True
    assert result.events[0].entity_key.startswith("lmstudio/")
