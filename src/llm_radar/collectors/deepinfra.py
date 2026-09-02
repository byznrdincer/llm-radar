from datetime import datetime
from decimal import Decimal, InvalidOperation
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

DEEPINFRA_MODELS_URL = "https://api.deepinfra.com/models/list"
_LLM_TYPES = {
    "chat-completion",
    "language-modeling",
    "text-completion",
    "text-generation",
    "text-generation-inference",
    "text2text-generation",
}


def _cents_per_token_to_usd_per_million(value: Any, discount: Any = None) -> str | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        amount = Decimal(str(value)) * Decimal("10000")
        discount_amount = Decimal(str(discount or 0))
    except (InvalidOperation, ValueError):
        return None
    if amount < 0 or discount_amount < 0 or discount_amount > 1:
        return None
    return str(amount * (Decimal("1") - discount_amount))


class DeepInfraCollector(BaseCollector):
    """Collect DeepInfra's public model-list endpoint without inferring model openness."""

    name = "deepinfra"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(DEEPINFRA_MODELS_URL)
        response.raise_for_status()
        raw_payload: Any = response.json()
        items = raw_payload if isinstance(raw_payload, list) else []
        collected_at = collected_now()
        events = [
            event
            for item in items
            if isinstance(item, dict) and (event := self._to_event(item, collected_at)) is not None
        ]
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope | None:
        model_type = str(item.get("reported_type") or item.get("type") or "").strip().lower()
        if model_type not in _LLM_TYPES:
            return None
        model_id = item.get("model_name")
        entity_key = canonical_model_key(model_id)
        if entity_key is None:
            return None

        pricing = as_dict(item.get("pricing"))
        tags = string_list(item.get("tags")) or []
        discount = pricing.get("discount")
        input_modalities = ["text"]
        if "multimodal" in tags:
            input_modalities.append("image")
        payload = {
            "external_id": model_id,
            "name": model_id,
            "description": item.get("description"),
            "provider": "deepinfra",
            "developer": entity_key.split("/", 1)[0],
            "release_date": item.get("create_ts"),
            "status": "deprecated" if item.get("deprecated") else "active",
            "model_type": model_type,
            "context_window": item.get("max_tokens"),
            "input_modalities": input_modalities,
            "output_modalities": ["text"],
            "capabilities": tags or None,
            "quantization": item.get("quantization"),
            "pricing": {
                "input_per_1m_tokens": _cents_per_token_to_usd_per_million(
                    pricing.get("cents_per_input_token"), discount
                ),
                "output_per_1m_tokens": _cents_per_token_to_usd_per_million(
                    pricing.get("cents_per_output_token"), discount
                ),
                "cache_read_per_1m_tokens": _cents_per_token_to_usd_per_million(
                    pricing.get("rate_per_input_token_cached"), discount
                ),
                "cache_write_per_1m_tokens": _cents_per_token_to_usd_per_million(
                    pricing.get("rate_per_input_token_cache_write"), discount
                ),
                "currency": "USD",
            }
            if pricing.get("type") == "tokens"
            else None,
        }
        return model_event(
            source=self.name,
            source_url=DEEPINFRA_MODELS_URL,
            reliability=ReliabilityLevel.OFFICIAL_API,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
