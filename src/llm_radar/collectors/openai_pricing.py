from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.model_catalog import collected_now, model_event
from llm_radar.events.schemas import EventEnvelope, ReliabilityLevel

OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing.md"
_CONTEXT_NOTE = re.compile(r"\s*\([^)]*context[^)]*\)\s*$", re.IGNORECASE)


def _price(value: str) -> str | None:
    cleaned = value.strip().replace("$", "").replace(",", "")
    if cleaned in {"", "-", "—"}:
        return None
    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        return None
    return str(amount) if amount >= 0 else None


def parse_standard_pricing(markdown: str) -> list[dict[str, str | None]]:
    """Parse the official Standard pricing table, ignoring batch/long-context columns."""
    marker = "### Standard pricing data"
    section = markdown.split(marker, 1)[1] if marker in markdown else ""
    rows: list[dict[str, str | None]] = []
    for line in section.splitlines():
        if rows and line.startswith("### "):
            break
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 5 or cells[0] in {"Model", "---"} or set(cells[0]) == {"-"}:
            continue
        model_id = _CONTEXT_NOTE.sub("", cells[0]).strip().lower()
        if not model_id or " " in model_id:
            continue
        rows.append(
            {
                "model_id": model_id,
                "input": _price(cells[1]),
                "cache_read": _price(cells[2]),
                "output": _price(cells[4]),
            }
        )
    return rows


class OpenAIPricingCollector(BaseCollector):
    name = "openai-pricing"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(
            OPENAI_PRICING_URL,
            headers={"Accept": "text/markdown", "User-Agent": "llm-radar/1.0"},
        )
        response.raise_for_status()
        rows = parse_standard_pricing(response.text)
        if not rows:
            raise ValueError("OpenAI Standard pricing table was not found")
        collected_at = collected_now()
        events = [self._to_event(item, collected_at) for item in rows]
        return CollectorResult(events=events, raw_payload={"models": rows})

    def _to_event(self, item: dict[str, Any], collected_at: datetime) -> EventEnvelope:
        model_id = str(item["model_id"])
        return model_event(
            source=self.name,
            source_url=OPENAI_PRICING_URL,
            reliability=ReliabilityLevel.OFFICIAL_DOCUMENT,
            entity_key=f"openai/{model_id}",
            payload={
                "external_id": model_id,
                "name": model_id,
                "developer": "openai",
                "pricing": {
                    "input_per_1m_tokens": item.get("input"),
                    "output_per_1m_tokens": item.get("output"),
                    "cache_read_per_1m_tokens": item.get("cache_read"),
                    "currency": "USD",
                },
            },
            collected_at=collected_at,
        )
