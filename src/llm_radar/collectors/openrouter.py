from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    ReliabilityLevel,
)

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
ONE_MILLION = Decimal("1000000")


def _per_token_to_per_million(value: object) -> str | None:
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value))
        return str(amount * ONE_MILLION) if amount >= 0 else None
    except InvalidOperation:
        return None


class OpenRouterCollector(BaseCollector):
    name = "openrouter"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(OPENROUTER_MODELS_URL)
        response.raise_for_status()
        raw_payload: dict[str, Any] = response.json()
        collected_at = datetime.now(UTC)
        events = [self._to_event(item, collected_at) for item in raw_payload.get("data", [])]
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope:
        model_id = str(item["id"])
        pricing = item.get("pricing") or {}
        architecture = item.get("architecture") or {}
        top_provider = item.get("top_provider") or {}
        supported_parameters = [str(value) for value in item.get("supported_parameters") or []]
        supports_tools = "tools" in supported_parameters
        supports_reasoning = bool(item.get("reasoning")) or any(
            value in supported_parameters for value in ("reasoning", "include_reasoning")
        )
        created = item.get("created")
        release_date = None
        if isinstance(created, (int, float)) and created > 0:
            release_date = datetime.fromtimestamp(created, tz=UTC).date().isoformat()
        payload = {
            "external_id": model_id,
            "name": item.get("name") or model_id,
            "description": item.get("description"),
            "created": item.get("created"),
            "release_date": release_date,
            "context_window": item.get("context_length"),
            "max_output_tokens": top_provider.get("max_completion_tokens"),
            "input_modalities": architecture.get("input_modalities", []),
            "output_modalities": architecture.get("output_modalities", []),
            "tokenizer": architecture.get("tokenizer"),
            "supported_parameters": supported_parameters,
            "supports_tool_calling": supports_tools,
            "supports_structured_output": any(
                value in supported_parameters for value in ("structured_outputs", "response_format")
            ),
            "supports_reasoning": supports_reasoning,
            # The model catalog does not make a model-wide streaming guarantee.
            "supports_streaming": None,
            "pricing": {
                "input_per_1m_tokens": _per_token_to_per_million(pricing.get("prompt")),
                "output_per_1m_tokens": _per_token_to_per_million(pricing.get("completion")),
                "cache_read_per_1m_tokens": _per_token_to_per_million(
                    pricing.get("input_cache_read")
                ),
                "cache_write_per_1m_tokens": _per_token_to_per_million(
                    pricing.get("input_cache_write")
                ),
                "currency": "USD",
            },
        }
        return EventEnvelope(
            event_type=EventType.MODEL_UPDATED,
            source=self.name,
            entity_key=model_id,
            occurred_at=collected_at,
            collected_at=collected_at,
            payload=payload,
            metadata=EventMetadata(
                source_url=OPENROUTER_MODELS_URL,
                reliability=ReliabilityLevel.THIRD_PARTY,
            ),
        )
