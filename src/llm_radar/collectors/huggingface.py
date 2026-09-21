import logging
import re
from datetime import UTC, datetime
from typing import Any

from llm_radar.catalog import (
    PINNED_HF_MODELS,
    TURKISH_HF_ORGS,
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

# README prose often carries the only training-data hint for Turkish models
# whose HF card YAML omits `datasets:` (e.g. Cosmos LLaMA "30GB Turkish dataset").
_README_DATASET_PATTERNS = (
    re.compile(
        r"(?:with|using|on)\s+(?:a\s+|various\s+)?"
        r"(\d[\d.,]*\s*(?:GB|MB|K|M|B)?\s+"
        r"(?:Turkish|Türkçe)[^.!\n]{0,48}(?:dataset|corpus|instructions?))",
        re.IGNORECASE,
    ),
    re.compile(
        r"dataset consisting of\s+(\d[\d.,]*\s*K?\s+instructions?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"finetune(?:d)?\s+(?:version\s+of\s+[^\n]+?\s+)?"
        r"with\s+(?:various\s+)?(Turkish datasets?)",
        re.IGNORECASE,
    ),
)

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

# Turkish open-source catalogs (YTÜ Cosmos, dbmdz, …) intentionally include
# embeddings and classic encoder models alongside chat LLMs. Keep those when
# scraping Turkish orgs / Turkish search queries, but still reject audio/vision
# noise that is unrelated to the Turkey LLM page.
TURKISH_PIPELINE_TAGS = frozenset(
    {
        *LLM_PIPELINE_TAGS,
        "feature-extraction",
        "sentence-similarity",
        "fill-mask",
        "text-classification",
        "token-classification",
        "text-ranking",
        "question-answering",
        "summarization",
        "zero-shot-classification",
    }
)

_HF_CREATED_AT_MIGRATION_PREFIX = "2022-03-02"
_TURKISH_NAME_TOKENS = ("turkish", "turkce", "berturk", "turkcell", "kumru")


def _earliest_iso(*values: Any) -> str | None:
    stamps = [value.strip() for value in values if isinstance(value, str) and value.strip()]
    return min(stamps) if stamps else None


def _turkish_name_hint(*parts: Any) -> bool:
    haystack = " ".join(str(part).lower() for part in parts if part)
    return any(token in haystack for token in _TURKISH_NAME_TOKENS)


def _needs_first_commit(
    organization: str,
    created_at: str | None,
    *,
    model_name: str | None = None,
) -> bool:
    """Resolve first-commit for Turkish catalogs, or migration-dated Turkish names.

    Do not apply the 2022-03-02 hub migration heuristic to every HF repo — that
    would re-date unrelated classics (GPT-2, CTRL, …) on every collect.
    """
    if organization in TURKISH_HF_ORGS:
        return True
    if not (created_at and created_at.startswith(_HF_CREATED_AT_MIGRATION_PREFIX)):
        return False
    return _turkish_name_hint(model_name)


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
        if isinstance(value, list):
            for entry in value:
                if entry not in (None, ""):
                    return str(entry)
            continue
        if value not in (None, ""):
            return str(value)
    return None


def _datasets(card_data: dict[str, Any], tags: list[str]) -> list[str] | None:
    values: list[str] = []
    raw = card_data.get("datasets")
    if raw is None:
        raw = card_data.get("dataset")
    if isinstance(raw, list):
        values.extend(str(entry).strip() for entry in raw if entry not in (None, ""))
    elif raw not in (None, ""):
        values.append(str(raw).strip())
    for tag in tags:
        lowered = tag.lower()
        if lowered.startswith("dataset:"):
            name = tag.split(":", 1)[1].strip()
            if name:
                values.append(name)
    unique = sorted({value for value in values if value})
    return unique[:8] or None


def _datasets_from_readme(text: str) -> list[str] | None:
    values: list[str] = []
    stripped = text.strip()
    if stripped.startswith("---"):
        end = stripped.find("\n---", 3)
        if end != -1:
            for line in stripped[3:end].splitlines():
                if not line.lower().startswith("datasets:"):
                    continue
                remainder = line.split(":", 1)[1].strip()
                if remainder.startswith("[") and remainder.endswith("]"):
                    inner = remainder[1:-1]
                    values.extend(
                        part.strip().strip("'\"")
                        for part in inner.split(",")
                        if part.strip()
                    )
                elif remainder:
                    values.append(remainder.strip().strip("'\""))
    body = stripped[stripped.find("\n---", 3) + 4 :] if stripped.startswith("---") else stripped
    for pattern in _README_DATASET_PATTERNS:
        match = pattern.search(body)
        if match:
            values.append(re.sub(r"\s+", " ", match.group(1)).strip())
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.lower()
        if not value or key in seen:
            continue
        seen.add(key)
        unique.append(value)
    return unique[:8] or None


def _technique(item: dict[str, Any], card_data: dict[str, Any], tags: list[str]) -> str | None:
    pipeline = str(item.get("pipeline_tag") or "").strip().lower()
    haystack = " ".join(tags).lower()
    base = _base_model(card_data)
    if pipeline in {"feature-extraction", "sentence-similarity"}:
        return "Embedding"
    if pipeline in {"fill-mask"}:
        return "Pretrained"
    if pipeline in {
        "text-classification",
        "token-classification",
        "question-answering",
        "summarization",
        "zero-shot-classification",
    }:
        return "Encoder"
    if pipeline in {"text-ranking"}:
        return "Reranker"
    if "base_model:quantized" in haystack or "gguf" in haystack:
        return "Quantized"
    if "base_model:adapter" in haystack or "adapter" in haystack:
        return "Adapter"
    if (
        "base_model:finetune" in haystack
        or "fine-tune" in haystack
        or "finetune" in haystack
        or "instruct" in haystack
        or bool(base)
    ):
        return "Fine-tuned"
    if pipeline in LLM_PIPELINE_TAGS:
        return "Base"
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

    async def _fill_datasets_from_readme(
        self, model_id: str, payload: dict[str, Any]
    ) -> None:
        if payload.get("datasets"):
            return
        try:
            response = await self.client.get(
                f"https://huggingface.co/{model_id}/raw/main/README.md",
                headers=_headers(),
            )
        except Exception:
            logger.debug(
                "huggingface: README fetch failed for %s", model_id, exc_info=True
            )
            return
        if response.status_code >= 400:
            return
        found = _datasets_from_readme(response.text)
        if found:
            payload["datasets"] = found

    async def _first_commit_at(self, model_id: str) -> str | None:
        if not model_id:
            return None
        try:
            response = await self.client.get(
                f"https://huggingface.co/api/models/{model_id}/commits/main",
                headers=_headers(),
            )
        except Exception:
            logger.debug(
                "huggingface: commits fetch failed for %s", model_id, exc_info=True
            )
            return None
        if response.status_code >= 400:
            return None
        try:
            payload = response.json()
        except Exception:
            return None
        if not isinstance(payload, list):
            return None
        dates = [
            str(entry.get("date"))
            for entry in payload
            if isinstance(entry, dict) and entry.get("date")
        ]
        return min(dates) if dates else None

    async def _enrich_published_at(self, model_id: str, payload: dict[str, Any]) -> None:
        organization = str(payload.get("organization") or "")
        created_at = payload.get("published_at")
        created = created_at if isinstance(created_at, str) else None
        model_name = str(payload.get("name") or model_id.split("/")[-1] or "")
        if not _needs_first_commit(organization, created, model_name=model_name):
            return
        first_commit = await self._first_commit_at(model_id)
        if not first_commit:
            return
        payload["first_commit_at"] = first_commit
        if created:
            payload["hub_created_at"] = created
        payload["published_at"] = _earliest_iso(created, first_commit)

    @staticmethod
    def _to_event(
        item: dict[str, Any], collected_at: datetime
    ) -> tuple[EventEnvelope, dict[str, Any]] | None:
        model_id = str(item.get("id") or item.get("modelId") or "")
        if not model_id:
            return None
        weight_files = _weight_files(item)
        card_data = as_dict(item.get("cardData"))
        tasks = _task_tags(item, card_data)
        tag_list = tasks[:]
        raw_tags = item.get("tags")
        if isinstance(raw_tags, list):
            tag_list.extend(str(entry) for entry in raw_tags if entry)
        organization = model_id.split("/", 1)[0]
        payload = {
            "external_id": model_id,
            "name": model_id.split("/")[-1],
            "organization": organization,
            "pipeline_tag": item.get("pipeline_tag"),
            "tasks": tasks,
            "likes": item.get("likes"),
            "downloads": item.get("downloads"),
            "parameter_count": _parameter_count(item),
            "active_parameter_count": _active_parameter_count(card_data),
            "base_model": _base_model(card_data),
            "datasets": _datasets(card_data, tag_list),
            "technique": _technique(item, card_data, tag_list),
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
            "published_at": item.get("createdAt"),
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

        async def ingest(
            item: dict[str, Any],
            *,
            allowed_pipelines: frozenset[str] | None = None,
        ) -> None:
            if allowed_pipelines is not None:
                pipeline = item.get("pipeline_tag")
                # Untagged repos (common for GGUF mirrors) are kept for Turkish
                # org scrapes so instruct/GGUF variants are not silently dropped.
                if isinstance(pipeline, str) and pipeline.strip():
                    if pipeline.strip().lower() not in allowed_pipelines:
                        return
                elif allowed_pipelines is LLM_PIPELINE_TAGS:
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
            organization = str(payload.get("organization") or "")
            model_id = str(payload.get("external_id") or "")
            if not payload.get("datasets") and organization in TURKISH_HF_ORGS:
                await self._fill_datasets_from_readme(model_id, payload)
                # EventEnvelope validates a copy of payload; keep both in sync.
                event.payload["datasets"] = payload.get("datasets")
            await self._enrich_published_at(model_id, payload)
            for key in ("published_at", "first_commit_at", "hub_created_at"):
                if key in payload:
                    event.payload[key] = payload.get(key)
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
            allowed = (
                TURKISH_PIPELINE_TAGS if org in TURKISH_HF_ORGS else LLM_PIPELINE_TAGS
            )
            for item in response.json():
                await ingest(item, allowed_pipelines=allowed)

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
                await ingest(item, allowed_pipelines=TURKISH_PIPELINE_TAGS)

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
