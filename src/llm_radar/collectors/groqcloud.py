from datetime import datetime
from typing import Any

import httpx

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import canonical_model_key, collected_now, model_event
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"


class GroqCloudCollector(BaseCollector):
    name = "groqcloud"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        super().__init__(client)
        self.api_key = api_key

    async def collect(self) -> CollectorResult:
        response = await self.client.get(
            GROQ_MODELS_URL, headers={"Authorization": f"Bearer {self.api_key}"}
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
        payload = {
            "external_id": item.get("id"),
            "name": item.get("id"),
            "provider": "groqcloud",
            "developer": item.get("owned_by"),
            "status": "active" if item.get("active", True) else "inactive",
            "context_window": item.get("context_window"),
            "max_output_tokens": item.get("max_completion_tokens"),
            "api_available": bool(item.get("active", True)),
        }
        return model_event(
            source=self.name,
            source_url=GROQ_MODELS_URL,
            reliability=ReliabilityLevel.OFFICIAL_API,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
