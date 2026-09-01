import httpx
import pytest

from llm_radar.collectors.huggingface import HuggingFaceCollector


@pytest.mark.asyncio
async def test_huggingface_requires_downloadable_weight_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ("example",))
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", ())
    payload = [
        {
            "id": "example/with-weights",
            "cardData": {"license": "apache-2.0", "active_parameters": "3B"},
            "siblings": [{"rfilename": "model.safetensors"}],
            "safetensors": {"parameters": {"BF16": 7_000_000_000}},
        },
        {
            "id": "example/without-weights",
            "cardData": {"license": "apache-2.0"},
            "siblings": [{"rfilename": "config.json"}],
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["full"] == "true"
        assert request.url.params["cardData"] == "true"
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HuggingFaceCollector(client).collect()

    assert result.events[0].payload["is_open_weight"] is True
    assert result.events[0].payload["open_weight_evidence"]["files"] == ["model.safetensors"]
    assert result.events[0].payload["parameter_count"] == 7_000_000_000
    assert result.events[0].payload["active_parameter_count"] == "3B"
    assert result.events[1].payload["is_open_weight"] is None
    assert result.events[1].payload["open_weight_evidence"] is None
    assert result.events[1].payload["parameter_count"] is None


@pytest.mark.asyncio
async def test_huggingface_refreshes_pinned_weight_repositories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model_id = "nvidia/example-model-bf16"
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", (model_id,))

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/api/models/{model_id}"
        return httpx.Response(
            200,
            json={
                "id": model_id,
                "cardData": {"license": "nvidia-open-model-agreement"},
                "siblings": [
                    {"rfilename": "model-00001-of-00002.safetensors"},
                    {"rfilename": "config.json"},
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HuggingFaceCollector(client).collect()

    assert len(result.events) == 1
    assert result.events[0].entity_key == model_id
    assert result.events[0].payload["is_open_weight"] is True
    assert result.events[0].payload["open_weight_evidence"]["repository"].endswith(model_id)
