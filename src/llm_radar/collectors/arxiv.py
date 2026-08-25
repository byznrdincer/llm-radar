from datetime import UTC, datetime
from typing import Any
from xml.etree import ElementTree

from llm_radar.catalog import TECHNOLOGY_KEYWORDS, importance_for
from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    Importance,
    ReliabilityLevel,
)

ARXIV_URL = (
    "http://export.arxiv.org/api/query"
    "?search_query=all:large+language+model+OR+all:LLM+OR+all:multimodal+agent"
    "&sortBy=submittedDate&sortOrder=descending&max_results=25"
)
ATOM = "{http://www.w3.org/2005/Atom}"


def _text(node: ElementTree.Element | None) -> str:
    return "".join(node.itertext()).strip() if node is not None else ""


def _signals(text: str) -> list[str]:
    lowered = text.lower()
    return [
        slug
        for slug, words in TECHNOLOGY_KEYWORDS.items()
        if any(word in lowered for word in words)
    ]


class ArxivCollector(BaseCollector):
    name = "arxiv"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(ARXIV_URL)
        response.raise_for_status()
        root = ElementTree.fromstring(response.text)
        collected_at = datetime.now(UTC)
        events: list[EventEnvelope] = []
        raw_entries: list[dict[str, Any]] = []
        for entry in root.findall(f"{ATOM}entry"):
            arxiv_id = _text(entry.find(f"{ATOM}id")).rsplit("/", 1)[-1]
            title = " ".join(_text(entry.find(f"{ATOM}title")).split())
            summary = _text(entry.find(f"{ATOM}summary"))
            published = _text(entry.find(f"{ATOM}published"))
            url = _text(entry.find(f"{ATOM}id"))
            authors = [
                _text(author.find(f"{ATOM}name")) for author in entry.findall(f"{ATOM}author")
            ]
            categories = [node.attrib.get("term", "") for node in entry.findall(f"{ATOM}category")]
            payload = {
                "arxiv_id": arxiv_id,
                "title": title,
                "abstract": summary[:4000],
                "authors": authors,
                "published_at": published,
                "url": url,
                "categories": categories,
                "technology_signals": _signals(f"{title} {summary}"),
            }
            raw_entries.append(payload)
            events.append(
                EventEnvelope(
                    event_type=EventType.RESEARCH_PUBLISHED,
                    source=self.name,
                    entity_key=arxiv_id or title[:80],
                    occurred_at=collected_at,
                    collected_at=collected_at,
                    payload=payload,
                    importance=Importance(importance_for("research.published", payload).value),
                    metadata=EventMetadata(
                        source_url=url or "https://arxiv.org/",
                        reliability=ReliabilityLevel.ACADEMIC,
                        extraction_method="arxiv_api",
                    ),
                )
            )
        return CollectorResult(events=events, raw_payload={"entries": raw_entries})
