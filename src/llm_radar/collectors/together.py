from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import httpx

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import (
    as_dict,
    canonical_model_key,
    collected_now,
    model_event,
    price_per_million,
)
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

TOGETHER_MODELS_URL = "https://api.together.ai/v1/models"
TOGETHER_MODELS_DOCS_URL = "https://docs.together.ai/reference/models"
LLM_MODEL_TYPES = {"chat", "language", "code"}
OPEN_LICENSE_MARKERS = {
    "apache",
    "bsd",
    "cc-by",
    "deepseek",
    "gemma",
    "gpl",
    "llama",
    "mit",
    "mistral",
    "openrail",
    "qwen",
    "tongyi",
}


def _open_weight_evidence(model_url: Any, license_name: Any) -> dict[str, Any] | None:
    url = str(model_url or "").strip()
    license_value = str(license_name or "").strip()
    license_key = license_value.lower().replace("_", "-")
    host = urlparse(url).hostname or ""
    has_weight_link = host == "huggingface.co" or host.endswith(".huggingface.co")
    has_open_license = any(marker in license_key for marker in OPEN_LICENSE_MARKERS)
    if not has_weight_link and not has_open_license:
        return None
    return {
        "kind": "provider_model_license_or_weight_link",
        "source_url": TOGETHER_MODELS_DOCS_URL,
        "model_url": url or None,
        "license": license_value or None,
    }


class TogetherCollector(BaseCollector):
    """Collect Together's documented open-source model catalog."""

    name = "together"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        super().__init__(client)
        self.api_key = api_key

    async def collect(self) -> CollectorResult:
        response = await self.client.get(
            TOGETHER_MODELS_URL,
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        response.raise_for_status()
        raw_payload: Any = response.json()
        raw_items = raw_payload.get("data", []) if isinstance(raw_payload, dict) else raw_payload
        items = raw_items if isinstance(raw_items, list) else []
        collected_at = collected_now()
        events = [
            event
            for item in items
            if isinstance(item, dict) and (event := self._to_event(item, collected_at)) is not None
        ]
        return CollectorResult(events=events, raw_payload=raw_payload)

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope | None:
        model_type = str(item.get("type") or "").strip().lower()
        if model_type not in LLM_MODEL_TYPES:
            return None

        entity_key = canonical_model_key(item.get("id"), item.get("organization"))
        if entity_key is None:
            return None

        pricing = as_dict(item.get("pricing"))
        model_url = item.get("link")
        license_name = item.get("license")
        weight_evidence = _open_weight_evidence(model_url, license_name)
        payload = {
            "external_id": item.get("id"),
            "name": item.get("display_name") or item.get("id"),
            "provider": "together",
            "developer": item.get("organization"),
            "model_type": model_type,
            "context_window": item.get("context_length"),
            "license": license_name,
            "is_open_weight": True if weight_evidence else None,
            "availability": "open_weight" if weight_evidence else None,
            "openness": "open_weight" if weight_evidence else None,
            "open_weight_evidence": weight_evidence,
            "docs_url": model_url,
            "pricing": {
                "input_per_1m_tokens": price_per_million(
                    pricing.get("input"), unit="per_million_tokens"
                ),
                "output_per_1m_tokens": price_per_million(
                    pricing.get("output"), unit="per_million_tokens"
                ),
                "cache_read_per_1m_tokens": price_per_million(
                    pricing.get("cached_input"), unit="per_million_tokens"
                ),
                "currency": "USD",
            },
        }
        return model_event(
            source=self.name,
            source_url=TOGETHER_MODELS_URL,
            reliability=ReliabilityLevel.OFFICIAL_API,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
