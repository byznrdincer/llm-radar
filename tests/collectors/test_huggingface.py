import httpx
import pytest

from llm_radar.collectors.huggingface import HuggingFaceCollector


@pytest.mark.asyncio
async def test_huggingface_requires_downloadable_weight_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ("example",))
    monkeypatch.setattr("llm_radar.collectors.huggingface.HF_HUB_TASKS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.TURKISH_HF_SEARCH_QUERIES", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", ())
    payload = [
        {
            "id": "example/with-weights",
            "cardData": {
                "license": "apache-2.0",
                "active_parameters": "3B",
                "base_model": "meta-llama/Llama-3",
            },
            "gated": False,
            "pipeline_tag": "text-generation",
            "siblings": [{"rfilename": "model.safetensors"}],
            "safetensors": {"parameters": {"BF16": 7_000_000_000}},
        },
        {
            "id": "example/without-weights",
            "cardData": {"license": "apache-2.0"},
            "pipeline_tag": "text-generation",
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
    assert result.events[0].payload["base_model"] == "meta-llama/Llama-3"
    assert result.events[0].payload["gated"] is False
    assert "text-generation" in result.events[0].payload["tasks"]
    assert result.events[1].payload["is_open_weight"] is None
    assert result.events[1].payload["open_weight_evidence"] is None
    assert result.events[1].payload["parameter_count"] is None


@pytest.mark.asyncio
async def test_huggingface_survives_list_typed_license_and_keeps_other_repos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Some repos (e.g. dual-licensed ones) report cardData.license as a
    list rather than a string - this must not crash the whole run and
    discard every other repo already fetched in the same collection."""
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ("example",))
    monkeypatch.setattr("llm_radar.collectors.huggingface.HF_HUB_TASKS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.TURKISH_HF_SEARCH_QUERIES", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", ())
    payload = [
        {
            "id": "example/dual-licensed",
            "cardData": {"license": ["mit", "apache-2.0"]},
            "pipeline_tag": "text-generation",
            "siblings": [{"rfilename": "model.safetensors"}],
        },
        {
            "id": "example/normal",
            "cardData": {"license": "apache-2.0"},
            "pipeline_tag": "text-generation",
            "siblings": [{"rfilename": "model.safetensors"}],
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HuggingFaceCollector(client).collect()

    assert len(result.events) == 2
    dual = next(e for e in result.events if e.entity_key == "example/dual-licensed")
    assert dual.payload["license"] == "MIT"


@pytest.mark.asyncio
async def test_huggingface_org_scrape_excludes_non_llm_pipeline_tags(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Watched orgs (e.g. nvidia, google) publish many non-chat repos
    (embeddings, audio, adapters, ...) alongside their real LLMs. Org-based
    fetches have no pipeline_tag filter at the API level, so we must apply
    one ourselves or every repo type from a watched org enters the catalog."""
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ("example",))
    monkeypatch.setattr("llm_radar.collectors.huggingface.TURKISH_HF_ORGS", frozenset())
    monkeypatch.setattr("llm_radar.collectors.huggingface.HF_HUB_TASKS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.TURKISH_HF_SEARCH_QUERIES", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", ())
    payload = [
        {
            "id": "example/chat-model",
            "cardData": {"license": "apache-2.0"},
            "pipeline_tag": "text-generation",
            "siblings": [{"rfilename": "model.safetensors"}],
        },
        {
            "id": "example/embedding-model",
            "cardData": {"license": "apache-2.0"},
            "pipeline_tag": "feature-extraction",
            "siblings": [{"rfilename": "model.safetensors"}],
        },
        {
            "id": "example/untagged-repo",
            "cardData": {"license": "apache-2.0"},
            "siblings": [{"rfilename": "model.safetensors"}],
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HuggingFaceCollector(client).collect()

    assert len(result.events) == 1
    assert result.events[0].entity_key == "example/chat-model"


@pytest.mark.asyncio
async def test_huggingface_turkish_org_keeps_embeddings_and_technique(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """YTÜ Cosmos / dbmdz catalogs intentionally include embeddings and
    encoder models that the Turkey LLM page should surface."""
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ("ytu-ce-cosmos",))
    monkeypatch.setattr(
        "llm_radar.collectors.huggingface.TURKISH_HF_ORGS",
        frozenset({"ytu-ce-cosmos"}),
    )
    monkeypatch.setattr("llm_radar.collectors.huggingface.HF_HUB_TASKS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.TURKISH_HF_SEARCH_QUERIES", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", ())
    payload = [
        {
            "id": "ytu-ce-cosmos/Turkish-Llama-8b-v0.1",
            "cardData": {
                "license": "llama3",
                "base_model": "meta-llama/Meta-Llama-3-8B",
            },
            "pipeline_tag": "text-generation",
            "tags": ["base_model:finetune:meta-llama/Meta-Llama-3-8B"],
            "createdAt": "2024-05-23T13:54:27.000Z",
            "siblings": [{"rfilename": "model.safetensors"}],
        },
        {
            "id": "ytu-ce-cosmos/turkish-e5-large",
            "cardData": {
                "license": "mit",
                "base_model": ["intfloat/multilingual-e5-large-instruct"],
            },
            "pipeline_tag": "feature-extraction",
            "tags": ["base_model:finetune:intfloat/multilingual-e5-large-instruct"],
            "createdAt": "2025-04-11T07:50:37.000Z",
            "siblings": [{"rfilename": "model.safetensors"}],
        },
        {
            "id": "ytu-ce-cosmos/audio-noise",
            "cardData": {"license": "mit"},
            "pipeline_tag": "automatic-speech-recognition",
            "siblings": [{"rfilename": "model.safetensors"}],
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if "/commits/" in path:
            created = "2024-05-23T13:54:27.000Z"
            if "turkish-e5-large" in path:
                created = "2025-04-11T07:50:37.000Z"
            return httpx.Response(200, json=[{"date": created}])
        if path.endswith("/README.md"):
            if "turkish-e5-large" in path:
                return httpx.Response(
                    200,
                    text=(
                        "# Turkish-e5-Large\n\n"
                        "This is a finetune version of model "
                        "intfloat/multilingual-e5-large-instruct with various "
                        "Turkish datasets.\n"
                    ),
                )
            return httpx.Response(
                200,
                text=(
                    "# Cosmos LLaMa\n\n"
                    "This model is a fully fine-tuned version of the LLaMA-3 8B "
                    "model with a 30GB Turkish dataset.\n"
                ),
            )
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HuggingFaceCollector(client).collect()

    keys = {event.entity_key for event in result.events}
    assert keys == {
        "ytu-ce-cosmos/turkish-llama-8b-v0.1",
        "ytu-ce-cosmos/turkish-e5-large",
    }
    llama = next(e for e in result.events if e.entity_key.endswith("turkish-llama-8b-v0.1"))
    embed = next(e for e in result.events if e.entity_key.endswith("turkish-e5-large"))
    assert llama.payload["technique"] == "Fine-tuned"
    assert llama.payload["datasets"] == ["30GB Turkish dataset"]
    assert llama.payload["published_at"] == "2024-05-23T13:54:27.000Z"
    assert embed.payload["technique"] == "Embedding"
    assert embed.payload["base_model"] == "intfloat/multilingual-e5-large-instruct"
    assert embed.payload["datasets"] == ["Turkish datasets"]


@pytest.mark.asyncio
async def test_huggingface_uses_first_commit_when_hub_created_at_was_migrated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Classic BERTurk cards share a fake 2022-03-02 createdAt from the HF
    hub migration; the first git commit is the real publish date."""
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ("dbmdz",))
    monkeypatch.setattr(
        "llm_radar.collectors.huggingface.TURKISH_HF_ORGS",
        frozenset({"dbmdz"}),
    )
    monkeypatch.setattr("llm_radar.collectors.huggingface.HF_HUB_TASKS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.TURKISH_HF_SEARCH_QUERIES", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", ())
    payload = [
        {
            "id": "dbmdz/bert-base-turkish-cased",
            "cardData": {"license": "mit"},
            "pipeline_tag": "fill-mask",
            "createdAt": "2022-03-02T23:29:05.000Z",
            "siblings": [{"rfilename": "pytorch_model.bin"}],
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/commits/" in request.url.path:
            return httpx.Response(
                200,
                json=[
                    {"date": "2025-06-12T13:11:08.000Z"},
                    {"date": "2020-02-16T22:21:58.000Z"},
                ],
            )
        if request.url.path.endswith("/README.md"):
            return httpx.Response(404)
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HuggingFaceCollector(client).collect()

    assert len(result.events) == 1
    event = result.events[0]
    assert event.payload["hub_created_at"] == "2022-03-02T23:29:05.000Z"
    assert event.payload["first_commit_at"] == "2020-02-16T22:21:58.000Z"
    assert event.payload["published_at"] == "2020-02-16T22:21:58.000Z"


@pytest.mark.asyncio
async def test_huggingface_refreshes_pinned_weight_repositories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model_id = "nvidia/example-model-bf16"
    monkeypatch.setattr("llm_radar.collectors.huggingface.WATCHED_HF_ORGS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.HF_HUB_TASKS", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.TURKISH_HF_SEARCH_QUERIES", ())
    monkeypatch.setattr("llm_radar.collectors.huggingface.PINNED_HF_MODELS", (model_id,))

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == f"/api/models/{model_id}":
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
        return httpx.Response(200, json=[])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HuggingFaceCollector(client).collect()

    assert len(result.events) == 1
    assert result.events[0].entity_key == model_id
    assert result.events[0].payload["is_open_weight"] is True
    assert result.events[0].payload["open_weight_evidence"]["repository"].endswith(model_id)
