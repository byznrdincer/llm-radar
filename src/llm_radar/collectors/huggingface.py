from datetime import UTC, datetime
from typing import Any

from llm_radar.catalog import WATCHED_HF_ORGS, importance_for
from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.config import get_settings
from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    Importance,
    ReliabilityLevel,
)
from llm_radar.normalize import normalize_license


def _headers() -> dict[str, str]:
    headers = {"User-Agent": "llm-radar"}
    token = get_settings().huggingface_token
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


class HuggingFaceCollector(BaseCollector):
    name = "huggingface"

    async def collect(self) -> CollectorResult:
        collected_at = datetime.now(UTC)
        events: list[EventEnvelope] = []
        raw: list[dict[str, Any]] = []
        for org in WATCHED_HF_ORGS:
            response = await self.client.get(
                "https://huggingface.co/api/models",
                params={"author": org, "limit": 12, "sort": "lastModified", "direction": -1},
                headers=_headers(),
            )
            response.raise_for_status()
            for item in response.json():
                model_id = str(item.get("id") or item.get("modelId") or "")
                if not model_id:
                    continue
                payload = {
                    "external_id": model_id,
                    "name": model_id.split("/")[-1],
                    "organization": org,
                    "pipeline_tag": item.get("pipeline_tag"),
                    "likes": item.get("likes"),
                    "downloads": item.get("downloads"),
                    "license": normalize_license((item.get("cardData") or {}).get("license")),
                    "is_open_weight": True,
                    "last_modified": item.get("lastModified"),
                    "url": f"https://huggingface.co/{model_id}",
                }
                raw.append(payload)
                events.append(
                    EventEnvelope(
                        event_type=EventType.HUGGINGFACE_UPDATED,
                        source=self.name,
                        entity_key=model_id.lower(),
                        occurred_at=collected_at,
                        collected_at=collected_at,
                        payload=payload,
                        importance=Importance(importance_for("huggingface.updated", payload).value),
                        metadata=EventMetadata(
                            source_url=payload["url"],
                            reliability=ReliabilityLevel.OFFICIAL_API,
                            extraction_method="huggingface_api",
                        ),
                    )
                )
        return CollectorResult(events=events, raw_payload={"models": raw})
