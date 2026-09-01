from datetime import datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import (
    canonical_model_key,
    collected_now,
    model_event,
    optional_bool,
    price_per_million,
)
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

LITELLM_CATALOG_URL = "https://api.litellm.ai/model_catalog"
PAGE_SIZE = 500

# Hosting aliases such as bedrock and vertex_ai do not identify the model developer.
# Only direct developer catalogs are safe to turn into canonical model entities.
DIRECT_MODEL_PROVIDERS = {
    "ai21",
    "anthropic",
    "cohere",
    "deepseek",
    "gemini",
    "google",
    "meta",
    "minimax",
    "mistral",
    "moonshot",
    "nvidia",
    "openai",
    "perplexity",
    "qwen",
    "xai",
}
LLM_MODES = {"chat", "completion", "text_completion", "responses"}


class LiteLLMCollector(BaseCollector):
    name = "litellm"

    async def collect(self) -> CollectorResult:
        pages: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        page = 1
        while True:
            response = await self.client.get(
                LITELLM_CATALOG_URL, params={"page": page, "page_size": PAGE_SIZE}
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            pages.append(payload)
            batch = [item for item in payload.get("data", []) if isinstance(item, dict)]
            items.extend(batch)
            if not payload.get("has_more") or not batch:
                break
            page += 1
            if page > 100:
                raise RuntimeError("LiteLLM catalog pagination exceeded 100 pages")

        collected_at = collected_now()
        events = [
            event for item in items if (event := self._to_event(item, collected_at)) is not None
        ]
        raw_payload = {"pages": pages, "item_count": len(items)}
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope | None:
        provider = str(item.get("provider") or "").strip().lower()
        mode = str(item.get("mode") or "").strip().lower()
        if provider not in DIRECT_MODEL_PROVIDERS or (mode and mode not in LLM_MODES):
            return None
        entity_key = canonical_model_key(item.get("id"), provider)
        if entity_key is None:
            return None
        capabilities = {
            "vision": optional_bool(item.get("supports_vision")),
            "audio_input": optional_bool(item.get("supports_audio_input")),
            "prompt_caching": optional_bool(item.get("supports_prompt_caching")),
            "web_search": optional_bool(item.get("supports_web_search")),
            "pdf_input": optional_bool(item.get("supports_pdf_input")),
        }
        input_modalities = ["text"]
        if capabilities["vision"] is True:
            input_modalities.append("image")
        if capabilities["audio_input"] is True:
            input_modalities.append("audio")
        if capabilities["pdf_input"] is True:
            input_modalities.append("file")
        payload = {
            "external_id": item.get("id"),
            "name": item.get("id"),
            "provider": provider,
            "developer": provider,
            "model_type": mode or None,
            "release_date": item.get("release_date"),
            "status": "deprecated" if item.get("deprecated") else "active",
            "context_window": item.get("max_input_tokens") or item.get("context_window"),
            "max_output_tokens": item.get("max_output_tokens"),
            "input_modalities": input_modalities,
            "output_modalities": ["text"],
            "capabilities": {key: value for key, value in capabilities.items() if value is True},
            "supports_tool_calling": optional_bool(item.get("supports_function_calling")),
            "supports_structured_output": optional_bool(item.get("supports_response_schema")),
            "supports_reasoning": optional_bool(item.get("supports_reasoning")),
            "pricing": {
                "input_per_1m_tokens": price_per_million(item.get("input_cost_per_token")),
                "output_per_1m_tokens": price_per_million(item.get("output_cost_per_token")),
                "cache_read_per_1m_tokens": price_per_million(
                    item.get("cache_read_input_token_cost")
                ),
                "currency": "USD",
            },
        }
        return model_event(
            source=self.name,
            source_url=LITELLM_CATALOG_URL,
            reliability=ReliabilityLevel.COMMUNITY,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
