import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from selectolax.parser import HTMLParser, Node

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import (
    as_dict,
    canonical_model_key,
    collected_now,
    model_event,
    optional_bool,
)
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

FIREWORKS_MODELS_URL = "https://api.fireworks.ai/v1/accounts/fireworks/models"
FIREWORKS_MODELS_DOCS_URL = "https://docs.fireworks.ai/api-reference/list-models"
FIREWORKS_PUBLIC_MODELS_URL = "https://app.fireworks.ai/models?filter=LLM&serverless=true"
_PAGE_SIZE = 200
_CONTEXT_PATTERN = re.compile(r"Context\s+([\d.,]+)\s*([kKmM]?)\b")
_PRICE_PATTERN = re.compile(r"\$\s*([\d,.]+)\s*/M", re.IGNORECASE)


def _huggingface_model_id(value: Any) -> str | None:
    raw_url = str(value or "").strip()
    if not raw_url:
        return None
    parsed = urlparse(raw_url)
    if parsed.hostname not in {"huggingface.co", "www.huggingface.co"}:
        return None
    parts = [part for part in parsed.path.split("/") if part]
    return "/".join(parts[:2]) if len(parts) >= 2 else None


def _is_language_model(item: dict[str, Any]) -> bool:
    if isinstance(item.get("conversationConfig"), dict):
        return True
    model_type = str(as_dict(item.get("baseModelDetails")).get("modelType") or "").lower()
    return any(marker in model_type for marker in ("chat", "language", "text", "causal"))


class FireworksCollector(BaseCollector):
    """Collect Fireworks models from its API or public official catalog."""

    name = "fireworks"

    def __init__(self, client: httpx.AsyncClient, api_key: str | None = None) -> None:
        super().__init__(client)
        self.api_key = api_key

    async def collect(self) -> CollectorResult:
        if not self.api_key:
            return await self._collect_public_catalog()

        return await self._collect_api()

    async def _collect_api(self) -> CollectorResult:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        pages: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        page_token: str | None = None
        while True:
            params: dict[str, str | int] = {
                "pageSize": _PAGE_SIZE,
                "filter": "supports_serverless=true",
            }
            if page_token:
                params["pageToken"] = page_token
            response = await self.client.get(FIREWORKS_MODELS_URL, headers=headers, params=params)
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            pages.append(payload)
            items.extend(item for item in payload.get("models", []) if isinstance(item, dict))
            raw_token = payload.get("nextPageToken")
            page_token = str(raw_token) if raw_token else None
            if not page_token:
                break
            if len(pages) >= 100:
                raise RuntimeError("Fireworks catalog pagination exceeded 100 pages")

        collected_at = collected_now()
        events = [
            event for item in items if (event := self._to_event(item, collected_at)) is not None
        ]
        return CollectorResult(
            events=events, raw_payload={"pages": pages, "item_count": len(items)}
        )

    async def _collect_public_catalog(self) -> CollectorResult:
        response = await self.client.get(FIREWORKS_PUBLIC_MODELS_URL)
        response.raise_for_status()
        document = HTMLParser(response.text)
        cards = [
            card
            for card in document.css('a[data-testid="model-card"]')
            if any(node.text(strip=True) == "LLM" for node in card.css("span"))
        ]
        collected_at = collected_now()
        events = [
            event
            for card in cards
            if (event := self._public_card_to_event(card, collected_at)) is not None
        ]
        return CollectorResult(
            events=events,
            raw_payload={"html": response.text, "item_count": len(cards)},
        )

    def _public_card_to_event(self, card: Node, collected_at: datetime) -> EventEnvelope | None:
        href = str(card.attributes.get("href") or "").strip()
        model_id = href.rstrip("/").rsplit("/", 1)[-1] if href else None
        developer_node = card.css_first("img")
        developer = (
            re.sub(
                r"\s+logo$",
                "",
                str(developer_node.attributes.get("alt") or "").strip(),
                flags=re.IGNORECASE,
            )
            if developer_node is not None
            else ""
        )
        entity_key = canonical_model_key(model_id, developer or "fireworks")
        if entity_key is None:
            return None

        title_node = card.css_first(".truncate.font-medium.text-base")
        labels = {
            node.text(strip=True).lower()
            for node in card.css('[data-sentry-component="ModelCapabilityLabel"]')
            if node.text(strip=True)
        }
        input_modalities = ["text"]
        if "vision" in labels:
            input_modalities.append("image")

        pricing: dict[str, str] = {"currency": "USD"}
        price_fields = {
            "uncached": "input_per_1m_tokens",
            "cached": "cache_read_per_1m_tokens",
            "output": "output_per_1m_tokens",
        }
        for row in card.css("div.space-x-1"):
            spans = [node.text(strip=True) for node in row.css("span")]
            if len(spans) < 2:
                continue
            field = price_fields.get(spans[-1].lower())
            price = _public_price_per_million(spans[0])
            if field and price is not None:
                pricing[field] = price

        model_url = urljoin(FIREWORKS_PUBLIC_MODELS_URL, href)
        payload = {
            "external_id": model_id,
            "name": title_node.text(strip=True) if title_node is not None else model_id,
            "provider": "fireworks",
            "developer": entity_key.split("/", 1)[0],
            "status": "active",
            "context_window": _public_context_window(card.text(separator=" ", strip=True)),
            "input_modalities": input_modalities,
            "output_modalities": ["text"],
            "capabilities": sorted(labels) or None,
            "supports_tool_calling": True if "function-calling" in labels else None,
            "supports_reasoning": True if "reasoning" in labels else None,
            "docs_url": model_url,
            "pricing": pricing,
        }
        return model_event(
            source=self.name,
            source_url=FIREWORKS_PUBLIC_MODELS_URL,
            reliability=ReliabilityLevel.OFFICIAL_DOCUMENT,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
            extraction_method="html",
        )

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope | None:
        if not _is_language_model(item):
            return None
        resource_name = str(item.get("name") or "").strip()
        model_id = resource_name.rsplit("/", 1)[-1] if resource_name else None
        huggingface_url = item.get("huggingFaceUrl")
        huggingface_id = _huggingface_model_id(huggingface_url)
        entity_key = canonical_model_key(huggingface_id or model_id, "fireworks")
        if entity_key is None:
            return None

        supports_image = optional_bool(item.get("supportsImageInput"))
        input_modalities = ["text"]
        if supports_image is True:
            input_modalities.append("image")
        weight_evidence = (
            {
                "kind": "huggingface_weight_repository",
                "source_url": FIREWORKS_MODELS_DOCS_URL,
                "weights_url": huggingface_url,
            }
            if huggingface_id
            else None
        )
        payload = {
            "external_id": resource_name or model_id,
            "name": item.get("displayName") or model_id,
            "description": item.get("description"),
            "provider": "fireworks",
            "developer": entity_key.split("/", 1)[0],
            "release_date": item.get("createTime"),
            "status": "deprecated" if item.get("deprecationDate") else "active",
            "context_window": item.get("contextLength"),
            "input_modalities": input_modalities,
            "output_modalities": ["text"],
            "supports_tool_calling": optional_bool(item.get("supportsTools")),
            "docs_url": huggingface_url or item.get("githubUrl"),
            "is_open_weight": True if weight_evidence else None,
            "availability": "open_weight" if weight_evidence else None,
            "openness": "open_weight" if weight_evidence else None,
            "open_weight_evidence": weight_evidence,
        }
        return model_event(
            source=self.name,
            source_url=FIREWORKS_MODELS_URL,
            reliability=ReliabilityLevel.OFFICIAL_API,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )


def _public_context_window(value: str) -> int | None:
    match = _CONTEXT_PATTERN.search(value)
    if not match:
        return None
    try:
        amount = Decimal(match.group(1).replace(",", ""))
    except InvalidOperation:
        return None
    multiplier = {"k": Decimal("1000"), "m": Decimal("1000000")}.get(
        match.group(2).lower(), Decimal("1")
    )
    return int(amount * multiplier)


def _public_price_per_million(value: str) -> str | None:
    match = _PRICE_PATTERN.search(value)
    if not match:
        return None
    try:
        amount = Decimal(match.group(1).replace(",", ""))
    except InvalidOperation:
        return None
    return str(amount) if amount >= 0 else None
