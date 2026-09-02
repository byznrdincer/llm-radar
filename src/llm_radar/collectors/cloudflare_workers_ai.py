import re
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx
from selectolax.parser import HTMLParser, Node

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

_PAGE_SIZE = 100
CLOUDFLARE_PUBLIC_MODELS_URL = "https://developers.cloudflare.com/workers-ai/models/"
_PUBLIC_MODEL_PATH = re.compile(r"^/workers-ai/models/[^/]+/$")


def cloudflare_models_url(account_id: str) -> str:
    return f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/models/search"


def _page_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    result = payload.get("result")
    if isinstance(result, list):
        raw_items = result
    elif isinstance(result, dict):
        raw_items = result.get("data", [])
    else:
        raw_items = payload.get("data", [])
    return [item for item in raw_items if isinstance(item, dict)]


class CloudflareWorkersAICollector(BaseCollector):
    """Collect Workers AI models from its API or public official catalog."""

    name = "cloudflare-workers-ai"

    def __init__(
        self,
        client: httpx.AsyncClient,
        account_id: str | None = None,
        api_token: str | None = None,
    ) -> None:
        super().__init__(client)
        self.account_id = account_id
        self.api_token = api_token

    async def collect(self) -> CollectorResult:
        if not self.account_id or not self.api_token:
            return await self._collect_public_catalog()

        return await self._collect_api()

    async def _collect_api(self) -> CollectorResult:
        assert self.account_id is not None
        assert self.api_token is not None
        url = cloudflare_models_url(self.account_id)
        headers = {"Authorization": f"Bearer {self.api_token}"}
        pages: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        page = 1
        while True:
            response = await self.client.get(
                url,
                headers=headers,
                params={
                    "format": "openrouter",
                    "hide_experimental": "true",
                    "include_deprecated": "false",
                    "page": page,
                    "per_page": _PAGE_SIZE,
                },
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            pages.append(payload)
            batch = _page_items(payload)
            items.extend(batch)
            result_info = as_dict(payload.get("result_info"))
            total_pages = result_info.get("total_pages")
            if isinstance(total_pages, int):
                if page >= total_pages:
                    break
            elif len(batch) < _PAGE_SIZE:
                break
            page += 1
            if page > 100:
                raise RuntimeError("Cloudflare Workers AI pagination exceeded 100 pages")

        collected_at = collected_now()
        events = [
            event
            for item in items
            if (event := self._to_event(item, collected_at, url)) is not None
        ]
        return CollectorResult(
            events=events, raw_payload={"pages": pages, "item_count": len(items)}
        )

    async def _collect_public_catalog(self) -> CollectorResult:
        response = await self.client.get(CLOUDFLARE_PUBLIC_MODELS_URL)
        response.raise_for_status()
        document = HTMLParser(response.text)
        cards = [
            node
            for node in document.css("a")
            if _PUBLIC_MODEL_PATH.fullmatch(str(node.attributes.get("href") or ""))
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
        model_node = card.css_first("h3")
        if model_node is None:
            return None
        model_id = model_node.text(strip=True)

        developer: str | None = None
        task_type: str | None = None
        for node in card.css("div"):
            labels = [span.text(strip=True) for span in node.css("span")]
            if "Text Generation" in labels:
                task_type = "Text Generation"
                developer = next((label for label in labels if label != task_type), None)
                break
        if task_type != "Text Generation" or not developer:
            return None

        entity_key = canonical_model_key(model_id, developer)
        if entity_key is None:
            return None
        chips = {
            node.text(strip=True).lower() for node in card.css("li span") if node.text(strip=True)
        }
        description_node = card.css_first("p")
        href = str(card.attributes.get("href") or "")
        docs_url = urljoin(CLOUDFLARE_PUBLIC_MODELS_URL, href)
        input_modalities = ["text"]
        if "vision" in chips:
            input_modalities.append("image")
        payload = {
            "external_id": f"@cf/{entity_key}",
            "name": model_id,
            "description": (
                description_node.text(strip=True) if description_node is not None else None
            ),
            "provider": "cloudflare-workers-ai",
            "developer": entity_key.split("/", 1)[0],
            "status": "deprecated" if "deprecated" in chips else "active",
            "input_modalities": input_modalities,
            "output_modalities": ["text"],
            "capabilities": sorted(chips) or None,
            "supports_tool_calling": (
                True if {"function calling", "function-calling"} & chips else None
            ),
            "supports_reasoning": True if "reasoning" in chips else None,
            "docs_url": docs_url,
        }
        return model_event(
            source=self.name,
            source_url=CLOUDFLARE_PUBLIC_MODELS_URL,
            reliability=ReliabilityLevel.OFFICIAL_DOCUMENT,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
            extraction_method="html",
        )

    def _to_event(
        self, item: dict[str, Any], collected_at: datetime, source_url: str
    ) -> EventEnvelope | None:
        architecture = as_dict(item.get("architecture"))
        input_modalities = string_list(architecture.get("input_modalities"))
        output_modalities = string_list(architecture.get("output_modalities"))
        if not input_modalities or "text" not in input_modalities:
            return None
        if not output_modalities or "text" not in output_modalities:
            return None

        model_id = item.get("id")
        entity_key = canonical_model_key(model_id, item.get("owned_by"))
        if entity_key is None:
            return None
        supported_parameters = string_list(item.get("supported_parameters"))
        parameter_set = set(supported_parameters or [])
        pricing = as_dict(item.get("pricing"))
        top_provider = as_dict(item.get("top_provider"))
        payload = {
            "external_id": model_id,
            "name": item.get("name") or model_id,
            "description": item.get("description"),
            "provider": "cloudflare-workers-ai",
            "developer": entity_key.split("/", 1)[0],
            "status": "active",
            "context_window": item.get("context_length"),
            "max_output_tokens": top_provider.get("max_completion_tokens"),
            "input_modalities": input_modalities,
            "output_modalities": output_modalities,
            "tokenizer": architecture.get("tokenizer"),
            "supported_parameters": supported_parameters,
            "supports_tool_calling": (
                "tools" in parameter_set if supported_parameters is not None else None
            ),
            "supports_structured_output": (
                bool(parameter_set & {"response_format", "structured_outputs"})
                if supported_parameters is not None
                else None
            ),
            "supports_reasoning": (
                bool(parameter_set & {"reasoning", "include_reasoning"})
                if supported_parameters is not None
                else None
            ),
            "pricing": {
                "input_per_1m_tokens": price_per_million(pricing.get("prompt")),
                "output_per_1m_tokens": price_per_million(pricing.get("completion")),
                "cache_read_per_1m_tokens": price_per_million(pricing.get("input_cache_read")),
                "cache_write_per_1m_tokens": price_per_million(pricing.get("input_cache_write")),
                "currency": "USD",
            },
        }
        return model_event(
            source=self.name,
            source_url=source_url,
            reliability=ReliabilityLevel.OFFICIAL_API,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
