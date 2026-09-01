from datetime import UTC, datetime
from typing import Any

from llm_radar.catalog import PINNED_HF_MODELS, WATCHED_HF_ORGS, importance_for
from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import as_dict
from llm_radar.config import get_settings
from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    Importance,
    ReliabilityLevel,
)
from llm_radar.normalize import normalize_license

WEIGHT_SUFFIXES = (".safetensors", ".gguf", ".bin", ".pt", ".pth")


def _weight_files(item: dict[str, Any]) -> list[str]:
    siblings = item.get("siblings")
    if not isinstance(siblings, list):
        return []
    files = [
        str(sibling.get("rfilename") or "") for sibling in siblings if isinstance(sibling, dict)
    ]
    return sorted(
        filename
        for filename in files
        if filename.lower().endswith(WEIGHT_SUFFIXES)
        and not filename.lower().endswith(("tokenizer.bin", "training_args.bin"))
    )


def _headers() -> dict[str, str]:
    headers = {"User-Agent": "llm-radar"}
    token = get_settings().huggingface_token
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


class HuggingFaceCollector(BaseCollector):
    name = "huggingface"

    @staticmethod
    def _to_event(
        item: dict[str, Any], collected_at: datetime
    ) -> tuple[EventEnvelope, dict[str, Any]] | None:
        model_id = str(item.get("id") or item.get("modelId") or "")
        if not model_id:
            return None
        weight_files = _weight_files(item)
        card_data = as_dict(item.get("cardData"))
        payload = {
            "external_id": model_id,
            "name": model_id.split("/")[-1],
            "organization": model_id.split("/", 1)[0],
            "pipeline_tag": item.get("pipeline_tag"),
            "likes": item.get("likes"),
            "downloads": item.get("downloads"),
            "license": normalize_license(card_data.get("license")),
            "is_open_weight": True if weight_files else None,
            "open_weight_evidence": {
                "kind": "downloadable_weight_files",
                "files": weight_files[:20],
                "repository": f"https://huggingface.co/{model_id}",
            }
            if weight_files
            else None,
            "last_modified": item.get("lastModified"),
            "url": f"https://huggingface.co/{model_id}",
        }
        event = EventEnvelope(
            event_type=EventType.HUGGINGFACE_UPDATED,
            source="huggingface",
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
        return event, payload

    async def collect(self) -> CollectorResult:
        collected_at = datetime.now(UTC)
        events: list[EventEnvelope] = []
        raw: list[dict[str, Any]] = []
        seen: set[str] = set()
        for org in WATCHED_HF_ORGS:
            response = await self.client.get(
                "https://huggingface.co/api/models",
                params={
                    "author": org,
                    "limit": 12,
                    "sort": "lastModified",
                    "direction": -1,
                    "full": "true",
                    "cardData": "true",
                },
                headers=_headers(),
            )
            response.raise_for_status()
            for item in response.json():
                converted = self._to_event(item, collected_at)
                if converted is None:
                    continue
                event, payload = converted
                if event.entity_key in seen:
                    continue
                seen.add(event.entity_key)
                raw.append(payload)
                events.append(event)
        for model_id in PINNED_HF_MODELS:
            entity_key = model_id.lower()
            if entity_key in seen:
                continue
            response = await self.client.get(
                f"https://huggingface.co/api/models/{model_id}",
                params={"full": "true", "cardData": "true"},
                headers=_headers(),
            )
            response.raise_for_status()
            converted = self._to_event(response.json(), collected_at)
            if converted is None:
                continue
            event, payload = converted
            seen.add(event.entity_key)
            raw.append(payload)
            events.append(event)
        return CollectorResult(events=events, raw_payload={"models": raw})
