from __future__ import annotations

import re
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import collected_now, model_event
from llm_radar.events.schemas import ReliabilityLevel

OLLAMA_LIBRARY_URL = "https://ollama.com/library"
OLLAMA_TAGS_URL = "https://ollama.com/api/tags"
_LIBRARY_LINK = re.compile(r'href="/library/([^"/?#]+)"')


def _parse_library_names(html: str) -> list[str]:
    return sorted({match.lower() for match in _LIBRARY_LINK.findall(html)})


class OllamaCollector(BaseCollector):
    name = "ollama"

    async def collect(self) -> CollectorResult:
        collected_at = collected_now()
        library_response = await self.client.get(OLLAMA_LIBRARY_URL)
        library_response.raise_for_status()
        library_names = _parse_library_names(library_response.text)

        tags_response = await self.client.get(OLLAMA_TAGS_URL)
        tags_response.raise_for_status()
        tag_models = {
            str(item.get("name") or "").split(":")[0].lower(): item
            for item in tags_response.json().get("models", [])
            if isinstance(item, dict)
        }

        events = []
        raw_models: list[dict[str, Any]] = []
        seen: set[str] = set()

        for name in library_names:
            if not name or name in seen:
                continue
            seen.add(name)
            tag_item = tag_models.get(name)
            details = (tag_item or {}).get("details") or {}
            capabilities = ["local_runnable", "ollama_compatible"]
            if details.get("family"):
                capabilities.append(str(details["family"]).lower())
            payload: dict[str, Any] = {
                "external_id": name,
                "name": name,
                "runtime_platform": "ollama",
                "local_runnable": True,
                "ollama_compatible": True,
                "capabilities": sorted(set(capabilities)),
                "is_open_weight": True,
                "openness": "open_weight",
                "availability": "open_weight",
                "family": details.get("family") or (
                    details.get("families")[0]
                    if isinstance(details.get("families"), list) and details.get("families")
                    else None
                ),
                "quantization_level": details.get("quantization_level"),
                "url": f"{OLLAMA_LIBRARY_URL}/{name}",
            }
            if tag_item:
                payload.update(
                    {
                        "modified_at": tag_item.get("modified_at"),
                        "size_bytes": tag_item.get("size"),
                        "parameter_size": details.get("parameter_size"),
                    }
                )
            raw_models.append(payload)
            events.append(
                model_event(
                    source=self.name,
                    source_url=payload["url"],
                    reliability=ReliabilityLevel.THIRD_PARTY,
                    entity_key=f"ollama/{name}",
                    payload=payload,
                    collected_at=collected_at,
                )
            )

        return CollectorResult(events=events, raw_payload={"models": raw_models, "count": len(raw_models)})
