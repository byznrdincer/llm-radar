import logging
from datetime import UTC, datetime
from typing import Any

from llm_radar.catalog import (
    PINNED_HF_MODELS,
    TURKISH_HF_SEARCH_QUERIES,
    WATCHED_HF_ORGS,
    importance_for,
)
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

logger = logging.getLogger(__name__)

HF_HUB_TASKS = ("text-generation", "image-text-to-text", "text-to-image")
WEIGHT_SUFFIXES = (".safetensors", ".gguf", ".bin", ".pt", ".pth")

# Organization- and search-based fetches have no task filter at the API level
# (unlike HF_HUB_TASKS, which asks the API for one specific pipeline_tag), so
# without this a watched org's non-LLM repos (embeddings, audio, adapters,
# datasets processors, ...) would enter the catalog alongside its real models.
# This mirrors HF_HUB_TASKS plus the two other tags legitimate chat/LLM
# families commonly use (T5-style encoder-decoders, older "conversational"
# cards) so we don't accidentally drop known model lines like Google's T5.
LLM_PIPELINE_TAGS = frozenset(
    {*HF_HUB_TASKS, "text2text-generation", "conversational"}
)


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


def _parameter_count(item: dict[str, Any]) -> int | None:
    safetensors = as_dict(item.get("safetensors"))
    parameters = as_dict(safetensors.get("parameters"))
    values = [value for value in parameters.values() if isinstance(value, int) and value > 0]
    return sum(values) if values else None


def _active_parameter_count(card_data: dict[str, Any]) -> int | str | None:
    for key in ("active_parameter_count", "active_parameters", "num_active_parameters"):
        value = card_data.get(key)
        if value not in (None, "") and isinstance(value, (int, str)):
            return value
    return None


def _base_model(card_data: dict[str, Any]) -> str | None:
    for key in ("base_model", "base", "base_model_name"):
        value = card_data.get(key)
        if value not in (None, ""):
            return str(value)
    return None


def _gated_status(item: dict[str, Any], card_data: dict[str, Any]) -> bool | None:
    gated = item.get("gated")
    if isinstance(gated, bool):
        return gated
    if gated not in (None, ""):
        return str(gated).strip().lower() not in {"false", "manual", "auto", "none"}
    card_gated = card_data.get("gated")
    if isinstance(card_gated, bool):
        return card_gated
    if card_gated not in (None, ""):
        return True
    return None


def _task_tags(item: dict[str, Any], card_data: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    pipeline = item.get("pipeline_tag")
    if pipeline:
        tags.append(str(pipeline))
    for key in ("tags", "task", "tasks"):
        value = item.get(key) if key != "tasks" else card_data.get(key)
        if isinstance(value, list):
            tags.extend(str(entry) for entry in value if entry)
        elif value not in (None, ""):
            tags.append(str(value))
    return sorted({tag.strip().lower() for tag in tags if tag and str(tag).strip()})


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
            "tasks": _task_tags(item, card_data),
            "likes": item.get("likes"),
            "downloads": item.get("downloads"),
            "parameter_count": _parameter_count(item),
            "active_parameter_count": _active_parameter_count(card_data),
            "base_model": _base_model(card_data),
            "gated": _gated_status(item, card_data),
            "license": normalize_license(card_data.get("license")),
            "model_card": card_data.get("model_summary") or card_data.get("summary"),
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
        settings = get_settings()
        events: list[EventEnvelope] = []
        raw: list[dict[str, Any]] = []
        seen: set[str] = set()

        async def ingest(item: dict[str, Any], *, require_llm_pipeline: bool = False) -> None:
            if require_llm_pipeline:
                pipeline = item.get("pipeline_tag")
                if (
                    not isinstance(pipeline, str)
                    or pipeline.strip().lower() not in LLM_PIPELINE_TAGS
                ):
                    return
            try:
                converted = self._to_event(item, collected_at)
            except Exception:
                # One unusually-shaped repo (e.g. an unexpected cardData
                # field type) must not discard every org/task fetched so
                # far in this run - skip just this item and keep going.
                logger.warning(
                    "huggingface: skipped unparseable repo %r",
                    item.get("id") or item.get("modelId"),
                    exc_info=True,
                )
                return
            if converted is None:
                return
            event, payload = converted
            if event.entity_key in seen:
                return
            seen.add(event.entity_key)
            raw.append(payload)
            events.append(event)

        for org in WATCHED_HF_ORGS:
            response = await self.client.get(
                "https://huggingface.co/api/models",
                params={
                    "author": org,
                    "limit": settings.hf_org_limit,
                    "sort": "lastModified",
                    "direction": -1,
                    "full": "true",
                    "cardData": "true",
                },
                headers=_headers(),
            )
            response.raise_for_status()
            for item in response.json():
                await ingest(item, require_llm_pipeline=True)

        for task in HF_HUB_TASKS:
            response = await self.client.get(
                "https://huggingface.co/api/models",
                params={
                    "pipeline_tag": task,
                    "limit": settings.hf_task_limit,
                    "sort": "downloads",
                    "direction": -1,
                    "full": "true",
                    "cardData": "true",
                },
                headers=_headers(),
            )
            response.raise_for_status()
            for item in response.json():
                await ingest(item)

        for query in TURKISH_HF_SEARCH_QUERIES:
            response = await self.client.get(
                "https://huggingface.co/api/models",
                params={
                    "search": query,
                    "limit": settings.hf_task_limit,
                    "sort": "downloads",
                    "direction": -1,
                    "full": "true",
                    "cardData": "true",
                },
                headers=_headers(),
            )
            response.raise_for_status()
            for item in response.json():
                await ingest(item, require_llm_pipeline=True)

        for model_id in PINNED_HF_MODELS:
            entity_key = model_id.lower()
            if entity_key in seen:
                continue
            response = await self.client.get(
                f"https://huggingface.co/api/models/{model_id}",
                params={"full": "true", "cardData": "true"},
                headers=_headers(),
            )
            if response.status_code >= 400:
                continue
            await ingest(response.json())
        return CollectorResult(events=events, raw_payload={"models": raw})
