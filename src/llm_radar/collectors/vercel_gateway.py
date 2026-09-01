from datetime import datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import (
    as_dict,
    canonical_model_key,
    collected_now,
    model_event,
    price_per_million,
    string_list,
)
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

VERCEL_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models"


class VercelGatewayCollector(BaseCollector):
    name = "vercel-ai-gateway"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(VERCEL_MODELS_URL)
        response.raise_for_status()
        raw_payload: dict[str, Any] = response.json()
        collected_at = collected_now()
        events = [
            event
            for item in raw_payload.get("data", [])
            if isinstance(item, dict) and (event := self._to_event(item, collected_at)) is not None
        ]
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope | None:
        if str(item.get("type") or "").lower() != "language":
            return None
        entity_key = canonical_model_key(item.get("id"), item.get("owned_by"))
        if entity_key is None:
            return None
        modalities = as_dict(item.get("modalities"))
        parameters = string_list(item.get("supported_parameters"))
        parameter_set = set(parameters or [])
        tags = string_list(item.get("tags"))
        pricing = as_dict(item.get("pricing"))
        payload = {
            "external_id": item.get("id"),
            "name": item.get("name") or item.get("id"),
            "description": item.get("description"),
            "provider": "vercel-ai-gateway",
            "developer": item.get("owned_by"),
            "release_date": item.get("released"),
            "status": "active",
            "model_type": item.get("type"),
            "context_window": item.get("context_window"),
            "max_output_tokens": item.get("max_tokens"),
            "input_modalities": string_list(modalities.get("input")),
            "output_modalities": string_list(modalities.get("output")),
            "supported_parameters": parameters,
            "capabilities": tags,
            "supports_tool_calling": (
                "tools" in parameter_set or "tool-use" in (tags or [])
                if parameters is not None or tags is not None
                else None
            ),
            "supports_structured_output": (
                bool(parameter_set & {"response_format", "structured_outputs"})
                if parameters is not None
                else None
            ),
            "supports_reasoning": (
                bool(parameter_set & {"reasoning", "include_reasoning"})
                or "reasoning" in (tags or [])
                if parameters is not None or tags is not None
                else None
            ),
            "pricing": {
                "input_per_1m_tokens": price_per_million(pricing.get("input")),
                "output_per_1m_tokens": price_per_million(pricing.get("output")),
                "cache_read_per_1m_tokens": price_per_million(pricing.get("input_cache_read")),
                "cache_write_per_1m_tokens": price_per_million(pricing.get("input_cache_write")),
                "currency": "USD",
            },
        }
        return model_event(
            source=self.name,
            source_url=VERCEL_MODELS_URL,
            reliability=ReliabilityLevel.THIRD_PARTY,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
