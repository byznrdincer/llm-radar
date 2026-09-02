from datetime import datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.litellm import DIRECT_MODEL_PROVIDERS, LLM_MODES
from llm_radar.collectors.model_catalog import (
    canonical_model_key,
    collected_now,
    model_event,
    optional_bool,
    price_per_million,
    string_list,
)
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

BIFROST_DATASHEET_URL = "https://getbifrost.ai/datasheet"
_PROVIDER_ALIASES = {"gemini": "google"}


class BifrostCollector(BaseCollector):
    """Collect Bifrost's public model/pricing datasheet using direct providers only."""

    name = "bifrost"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(BIFROST_DATASHEET_URL)
        response.raise_for_status()
        raw_payload: Any = response.json()
        catalog = raw_payload if isinstance(raw_payload, dict) else {}
        collected_at = collected_now()
        events_by_key: dict[str, EventEnvelope] = {}
        for model_id, item in catalog.items():
            if not isinstance(item, dict):
                continue
            event = self._to_event(str(model_id), item, collected_at)
            if event is None:
                continue
            current = events_by_key.get(event.entity_key)
            if current is None or self._event_priority(event) > self._event_priority(current):
                events_by_key[event.entity_key] = event
        events = list(events_by_key.values())
        return CollectorResult(events=events, raw_payload=raw_payload)

    @staticmethod
    def _event_priority(event: EventEnvelope) -> tuple[bool, int]:
        external_key = canonical_model_key(event.payload.get("external_id"))
        exact_canonical_id = external_key == event.entity_key
        populated_fields = sum(
            value not in (None, "", [], {})
            for key, value in event.payload.items()
            if key not in {"external_id", "name"}
        )
        return exact_canonical_id, populated_fields

    def _to_event(
        self, model_id: str, item: dict[str, Any], collected_at: datetime
    ) -> EventEnvelope | None:
        provider = str(item.get("provider") or model_id.split("/", 1)[0]).strip().lower()
        if provider not in DIRECT_MODEL_PROVIDERS:
            return None
        mode = str(item.get("mode") or "").strip().lower()
        if mode and mode not in LLM_MODES:
            return None
        canonical_provider = _PROVIDER_ALIASES.get(provider, provider)
        base_model = str(item.get("base_model") or "").strip()
        canonical_id = base_model or model_id
        if "/" not in canonical_id:
            canonical_id = f"{canonical_provider}/{canonical_id}"
        else:
            _, canonical_name = canonical_id.split("/", 1)
            canonical_id = f"{canonical_provider}/{canonical_name}"
        entity_key = canonical_model_key(canonical_id)
        if entity_key is None:
            return None

        input_modalities = string_list(item.get("supported_modalities")) or ["text"]
        output_modalities = string_list(item.get("supported_output_modalities")) or ["text"]
        if "text" not in input_modalities or "text" not in output_modalities:
            return None
        payload = {
            "external_id": model_id,
            "name": canonical_id.split("/", 1)[1],
            "provider": "bifrost",
            "developer": canonical_provider,
            "model_type": mode or None,
            "status": "active",
            "context_window": item.get("max_input_tokens"),
            "max_output_tokens": item.get("max_output_tokens"),
            "input_modalities": input_modalities,
            "output_modalities": output_modalities,
            "supports_tool_calling": optional_bool(item.get("supports_function_calling")),
            "supports_structured_output": optional_bool(item.get("supports_response_schema")),
            "supports_reasoning": optional_bool(item.get("supports_reasoning")),
            "pricing": {
                "input_per_1m_tokens": price_per_million(item.get("input_cost_per_token")),
                "output_per_1m_tokens": price_per_million(item.get("output_cost_per_token")),
                "cache_read_per_1m_tokens": price_per_million(
                    item.get("cache_read_input_token_cost")
                ),
                "cache_write_per_1m_tokens": price_per_million(
                    item.get("cache_creation_input_token_cost")
                ),
                "currency": "USD",
            },
        }
        return model_event(
            source=self.name,
            source_url=BIFROST_DATASHEET_URL,
            reliability=ReliabilityLevel.COMMUNITY,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
