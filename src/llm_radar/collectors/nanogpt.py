from datetime import datetime
from typing import Any

import httpx

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import (
    as_dict,
    canonical_model_key,
    collected_now,
    enabled_capabilities,
    model_event,
    optional_bool,
    price_per_million,
)
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

NANOGPT_MODELS_URL = "https://nano-gpt.com/api/v1/models"


class NanoGPTCollector(BaseCollector):
    name = "nanogpt"

    def __init__(self, client: httpx.AsyncClient, api_key: str | None = None) -> None:
        super().__init__(client)
        self.api_key = api_key

    async def collect(self) -> CollectorResult:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else None
        response = await self.client.get(
            NANOGPT_MODELS_URL, params={"detailed": "true"}, headers=headers
        )
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
        entity_key = canonical_model_key(item.get("id"), item.get("owned_by"))
        if entity_key is None:
            return None
        capabilities = item.get("capabilities")
        capability_names = enabled_capabilities(capabilities)
        flags = as_dict(capabilities)
        pricing = as_dict(item.get("pricing"))
        unit = str(pricing.get("unit") or "per_million_tokens")
        input_modalities = ["text"]
        if optional_bool(flags.get("vision")) is True:
            input_modalities.append("image")
        if optional_bool(flags.get("pdf_upload")) is True:
            input_modalities.append("file")
        payload = {
            "external_id": item.get("id"),
            "name": item.get("name") or item.get("id"),
            "description": item.get("description"),
            "provider": "nanogpt",
            "developer": item.get("owned_by"),
            "context_window": item.get("context_length"),
            "max_output_tokens": item.get("max_output_tokens"),
            "input_modalities": input_modalities,
            "output_modalities": ["text"],
            "capabilities": capability_names,
            "supports_tool_calling": optional_bool(flags.get("tool_calling")),
            "supports_structured_output": optional_bool(flags.get("structured_output")),
            "supports_reasoning": optional_bool(flags.get("reasoning")),
            "pricing": {
                "input_per_1m_tokens": price_per_million(pricing.get("prompt"), unit=unit),
                "output_per_1m_tokens": price_per_million(pricing.get("completion"), unit=unit),
                "currency": pricing.get("currency") or "USD",
            },
        }
        return model_event(
            source=self.name,
            source_url=f"{NANOGPT_MODELS_URL}?detailed=true",
            reliability=ReliabilityLevel.THIRD_PARTY,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
