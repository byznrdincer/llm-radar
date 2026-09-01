from datetime import datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import (
    as_dict,
    canonical_model_key,
    collected_now,
    model_event,
    string_list,
)
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

AIMLAPI_MODELS_URL = "https://api.aimlapi.com/models"
LLM_MODEL_TYPES = {
    "anthropic/messages",
    "chat-completion",
    "llm",
    "openai/chat-completions",
    "openai/responses/submit",
}
MODEL_TYPE_PRIORITY = {
    "openai/chat-completions": 4,
    "chat-completion": 4,
    "anthropic/messages": 3,
    "openai/responses/submit": 2,
    "llm": 1,
}


class AIMLAPICollector(BaseCollector):
    name = "aimlapi"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(AIMLAPI_MODELS_URL)
        response.raise_for_status()
        raw_payload: Any = response.json()
        if isinstance(raw_payload, dict):
            raw_items = raw_payload.get("data", [])
        else:
            raw_items = raw_payload
        items = raw_items if isinstance(raw_items, list) else []
        collected_at = collected_now()
        by_model: dict[str, tuple[int, EventEnvelope]] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            event = self._to_event(item, collected_at)
            if event is None:
                continue
            priority = MODEL_TYPE_PRIORITY.get(str(item.get("type") or "").lower(), 0)
            existing = by_model.get(event.entity_key)
            if existing is None or priority > existing[0]:
                by_model[event.entity_key] = (priority, event)
        events = [event for _, event in by_model.values()]
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope | None:
        info = as_dict(item.get("info"))
        model_type = str(item.get("type") or "").lower()
        if model_type not in LLM_MODEL_TYPES:
            return None
        entity_key = canonical_model_key(item.get("id"), info.get("developer"))
        if entity_key is None:
            return None
        features = string_list(item.get("features"))
        normalized_features = {feature.lower() for feature in features or []}

        def has_feature(*needles: str) -> bool | None:
            if features is None:
                return None
            return any(
                any(needle in feature for needle in needles) for feature in normalized_features
            )

        is_text_model = "chat" in model_type or model_type in {"completion", "llm"}
        if model_type in {"anthropic/messages", "openai/responses/submit"}:
            is_text_model = True
        input_modalities = ["text"] if is_text_model else None
        payload = {
            "external_id": item.get("id"),
            "name": info.get("name") or item.get("id"),
            "description": info.get("description"),
            "provider": "aimlapi",
            "developer": info.get("developer"),
            "release_date": info.get("releasedAt"),
            "model_type": item.get("type"),
            "context_window": info.get("contextLength"),
            "max_output_tokens": info.get("maxTokens"),
            "input_modalities": input_modalities,
            "output_modalities": ["text"] if input_modalities else None,
            "supported_parameters": features,
            "supports_tool_calling": has_feature(".function", "tool"),
            "supports_structured_output": has_feature("response-format", "structured"),
            "supports_reasoning": has_feature("reasoning", "thinking"),
            "supports_streaming": has_feature("stream"),
            "docs_url": info.get("docs_url") or info.get("docsUrl"),
        }
        return model_event(
            source=self.name,
            source_url=AIMLAPI_MODELS_URL,
            reliability=ReliabilityLevel.THIRD_PARTY,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
