from __future__ import annotations

import re
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import collected_now, model_event
from llm_radar.events.schemas import ReliabilityLevel

LMSTUDIO_MODELS_URL = "https://lmstudio.ai/models"
_MODEL_LINK = re.compile(r'href="(/models/[^"/?#]+)"')


def _slug_from_path(path: str) -> str:
    return path.strip("/").split("/")[-1].lower()


def _display_name(slug: str) -> str:
    return slug.replace("-", " ").title()


class LMStudioCollector(BaseCollector):
    name = "lmstudio"

    async def collect(self) -> CollectorResult:
        collected_at = collected_now()
        response = await self.client.get(LMSTUDIO_MODELS_URL)
        response.raise_for_status()
        paths = sorted({_slug_from_path(match) for match in _MODEL_LINK.findall(response.text)})

        events = []
        raw_models: list[dict[str, Any]] = []
        for slug in paths:
            payload = {
                "external_id": slug,
                "name": _display_name(slug),
                "runtime_platform": "lmstudio",
                "local_runnable": True,
                "lm_studio_compatible": True,
                "capabilities": ["local_runnable", "lm_studio_compatible"],
                "is_open_weight": True,
                "openness": "open_weight",
                "availability": "open_weight",
                "url": f"{LMSTUDIO_MODELS_URL}/{slug}",
            }
            raw_models.append(payload)
            events.append(
                model_event(
                    source=self.name,
                    source_url=payload["url"],
                    reliability=ReliabilityLevel.THIRD_PARTY,
                    entity_key=f"lmstudio/{slug}",
                    payload=payload,
                    collected_at=collected_at,
                )
            )

        return CollectorResult(events=events, raw_payload={"models": raw_models, "count": len(raw_models)})
