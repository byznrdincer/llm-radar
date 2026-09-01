from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import httpx

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import canonical_model_key, collected_now, model_event
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

REPLICATE_MODELS_URL = "https://api.replicate.com/v1/models"
_LLM_INPUT_FIELDS = {
    "chat_history",
    "max_new_tokens",
    "max_tokens",
    "messages",
    "min_new_tokens",
    "system_prompt",
}
_MEDIA_INPUT_FRAGMENTS = {
    "aspect_ratio",
    "duration",
    "fps",
    "height",
    "mask",
    "width",
}


def _license_name(license_url: Any) -> str | None:
    if not license_url:
        return None
    path_parts = [part for part in urlparse(str(license_url)).path.split("/") if part]
    if not path_parts:
        return None
    candidate = path_parts[-1].lower()
    aliases = {
        "mit": "MIT",
        "apache-2.0": "Apache-2.0",
        "apache-2": "Apache-2.0",
    }
    return aliases.get(candidate)


def _is_llm_model(item: dict[str, Any]) -> bool:
    latest_version = item.get("latest_version")
    if not isinstance(latest_version, dict):
        return False
    schema = latest_version.get("openapi_schema")
    if not isinstance(schema, dict):
        return False
    components = schema.get("components")
    if not isinstance(components, dict):
        return False
    schemas = components.get("schemas")
    if not isinstance(schemas, dict):
        return False
    input_schema = schemas.get("Input")
    if not isinstance(input_schema, dict):
        return False
    properties = input_schema.get("properties")
    if not isinstance(properties, dict):
        return False
    fields = {str(field).lower() for field in properties}
    has_llm_controls = bool(fields & _LLM_INPUT_FIELDS)
    has_media_controls = any(
        fragment in field for field in fields for fragment in _MEDIA_INPUT_FRAGMENTS
    )
    return has_llm_controls and not has_media_controls


class ReplicateCollector(BaseCollector):
    name = "replicate"

    def __init__(self, client: httpx.AsyncClient, api_token: str) -> None:
        super().__init__(client)
        self.api_token = api_token

    async def collect(self) -> CollectorResult:
        headers = {"Authorization": f"Bearer {self.api_token}"}
        pages: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        next_url: str | None = REPLICATE_MODELS_URL
        while next_url:
            response = await self.client.get(next_url, headers=headers)
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            pages.append(payload)
            items.extend(item for item in payload.get("results", []) if isinstance(item, dict))
            raw_next = payload.get("next")
            next_url = str(raw_next) if raw_next else None
            if len(pages) >= 100 and next_url:
                raise RuntimeError("Replicate catalog pagination exceeded 100 pages")

        collected_at = collected_now()
        events = [
            event for item in items if (event := self._to_event(item, collected_at)) is not None
        ]
        return CollectorResult(
            events=events, raw_payload={"pages": pages, "item_count": len(items)}
        )

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope | None:
        if not _is_llm_model(item):
            return None
        owner = item.get("owner")
        name = item.get("name")
        raw_id = f"{owner}/{name}" if owner and name else None
        entity_key = canonical_model_key(raw_id, owner)
        if entity_key is None:
            return None
        license_name = _license_name(item.get("license_url"))
        weights_url = item.get("weights_url")
        payload = {
            "external_id": raw_id,
            "name": name or raw_id,
            "description": item.get("description"),
            "provider": "replicate",
            "developer": owner,
            "status": "active",
            "license": license_name,
            "is_open_weight": True if weights_url else None,
            "availability": "open_weight" if weights_url else None,
            "open_weight_evidence": weights_url,
            "model_url": item.get("url"),
            "github_url": item.get("github_url"),
            "paper_url": item.get("paper_url"),
            "latest_version": (
                item.get("latest_version", {}).get("id")
                if isinstance(item.get("latest_version"), dict)
                else None
            ),
            "run_count": item.get("run_count"),
        }
        return model_event(
            source=self.name,
            source_url=REPLICATE_MODELS_URL,
            reliability=ReliabilityLevel.OFFICIAL_API,
            entity_key=entity_key,
            payload=payload,
            collected_at=collected_at,
        )
