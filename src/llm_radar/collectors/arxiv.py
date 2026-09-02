import asyncio
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote
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

ARXIV_API = "http://export.arxiv.org/api/query"
ARXIV_URL = (
    f"{ARXIV_API}"
    "?search_query=all:large+language+model+OR+all:LLM+OR+all:multimodal+agent"
    "&sortBy=submittedDate&sortOrder=descending&max_results=25"
)

# Multiple feeds widen LLM/AI coverage beyond a single 25-result query.
ARXIV_QUERIES: list[tuple[str, int]] = [
    ("cat:cs.AI AND (all:language+model OR all:LLM OR all:transformer)", 120),
    ("cat:cs.CL AND (all:large+language+model OR all:LLM OR all:instruction+tuning)", 120),
    ("cat:cs.LG AND (all:foundation+model OR all:deep+learning OR all:neural+network)", 120),
    ("cat:cs.CV AND (all:multimodal OR all:vision-language OR all:VLM)", 100),
    ("cat:cs.RO AND (all:robot+OR+all:embodied+agent+OR+all:manipulation)", 80),
    ("all:large+language+model OR all:LLM OR all:multimodal+agent", 120),
    ("all:diffusion+OR+all:generative+model+OR+all:text-to-image", 100),
    ("all:reinforcement+learning+AND+(all:LLM+OR+all:language+model)", 100),
    ("all:agent+AND+(all:LLM+OR+all:language+model+OR+all:tool+use)", 100),
    ("all:reasoning+AND+(all:LLM+OR+all:language+model)", 80),
    ("all:alignment+OR+all:RLHF+OR+all:preference+learning", 80),
    ("all:retrieval+augmented+OR+all:RAG+OR+all:vector+database", 80),
]

ATOM = "{http://www.w3.org/2005/Atom}"


def arxiv_query_url(search_query: str, max_results: int) -> str:
    encoded = quote(search_query, safe="():+")
    return (
        f"{ARXIV_API}?search_query={encoded}"
        f"&sortBy=submittedDate&sortOrder=descending&max_results={max_results}"
    )


def _text(node: ElementTree.Element | None) -> str:
    return "".join(node.itertext()).strip() if node is not None else ""


def _signals(text: str) -> list[str]:
    lowered = text.lower()
    return [
        slug
        for slug, words in TECHNOLOGY_KEYWORDS.items()
        if any(word in lowered for word in words)
    ]


def _entry_payload(entry: ElementTree.Element, collected_at: datetime) -> dict[str, Any]:
    arxiv_id = _text(entry.find(f"{ATOM}id")).rsplit("/", 1)[-1]
    title = " ".join(_text(entry.find(f"{ATOM}title")).split())
    summary = _text(entry.find(f"{ATOM}summary"))
    published = _text(entry.find(f"{ATOM}published"))
    url = _text(entry.find(f"{ATOM}id"))
    authors = [_text(author.find(f"{ATOM}name")) for author in entry.findall(f"{ATOM}author")]
    categories = [node.attrib.get("term", "") for node in entry.findall(f"{ATOM}category")]
    return {
        "arxiv_id": arxiv_id,
        "title": title,
        "abstract": summary[:4000],
        "authors": authors,
        "published_at": published,
        "url": url,
        "categories": categories,
        "technology_signals": _signals(f"{title} {summary}"),
        "collected_at": collected_at,
    }


class ArxivCollector(BaseCollector):
    name = "arxiv"

    async def collect(self) -> CollectorResult:
        collected_at = datetime.now(UTC)
        events: list[EventEnvelope] = []
        raw_entries: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        for index, (search_query, max_results) in enumerate(ARXIV_QUERIES):
            if index > 0:
                await asyncio.sleep(3.1)
            response = await self.client.get(arxiv_query_url(search_query, max_results))
            response.raise_for_status()
            root = ElementTree.fromstring(response.text)
            for entry in root.findall(f"{ATOM}entry"):
                payload = _entry_payload(entry, collected_at)
                arxiv_id = str(payload.get("arxiv_id") or "")
                if not arxiv_id or arxiv_id in seen_ids:
                    continue
                seen_ids.add(arxiv_id)
                raw_entries.append(payload)
                events.append(
                    EventEnvelope(
                        event_type=EventType.RESEARCH_PUBLISHED,
                        source=self.name,
                        entity_key=arxiv_id or payload["title"][:80],
                        occurred_at=collected_at,
                        collected_at=collected_at,
                        payload=payload,
                        importance=Importance(importance_for("research.published", payload).value),
                        metadata=EventMetadata(
                            source_url=str(payload.get("url") or "https://arxiv.org/"),
                            reliability=ReliabilityLevel.ACADEMIC,
                            extraction_method="arxiv_api",
                        ),
                    )
                )

        return CollectorResult(events=events, raw_payload={"entries": raw_entries})
