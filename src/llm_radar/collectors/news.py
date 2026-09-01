from datetime import UTC, datetime
from typing import Any
from urllib.parse import urljoin
from xml.etree import ElementTree

from llm_radar.catalog import SOURCE_CATALOG, CollectionMethod, importance_for
from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.event_intelligence import classify_event
from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    Importance,
    ReliabilityLevel,
)

RSS = "{http://www.w3.org/2005/Atom}"

_EVENT_TYPE_BY_CATEGORY = {
    "ai_agent": EventType.AI_AGENT_UPDATED,
    "product_launch": EventType.PRODUCT_LAUNCHED,
    "funding": EventType.FUNDING_ANNOUNCED,
    "acquisition": EventType.ACQUISITION_ANNOUNCED,
    "partnership": EventType.PARTNERSHIP_ANNOUNCED,
    "infrastructure": EventType.INFRASTRUCTURE_UPDATED,
    "regulation": EventType.REGULATION_UPDATED,
    "security": EventType.SECURITY_ADVISORY,
    "api_update": EventType.API_UPDATED,
}


def _announcement_type(payload: dict[str, Any]) -> EventType:
    category = classify_event(
        EventType.COMPANY_ANNOUNCEMENT.value,
        str(payload.get("title") or ""),
        payload,
    )
    return _EVENT_TYPE_BY_CATEGORY.get(category, EventType.COMPANY_ANNOUNCEMENT)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _findtext(node: ElementTree.Element, names: tuple[str, ...]) -> str:
    for child in list(node) + [node]:
        if _local(child.tag) in names and (child.text or "").strip():
            return " ".join((child.text or "").split())
        for nested in child:
            if _local(nested.tag) in names and (nested.text or "").strip():
                return " ".join((nested.text or "").split())
    return ""


class RssCollector(BaseCollector):
    def __init__(self, client: Any, source_slug: str) -> None:
        super().__init__(client)
        spec = next(item for item in SOURCE_CATALOG if item.slug == source_slug)
        self.name = spec.slug
        self.source_url = spec.url
        self.reliability = spec.reliability

    async def collect(self) -> CollectorResult:
        response = await self.client.get(self.source_url)
        response.raise_for_status()
        root = ElementTree.fromstring(response.content)
        collected_at = datetime.now(UTC)
        events: list[EventEnvelope] = []
        items: list[dict[str, Any]] = []
        nodes = list(root.iter())
        entries = [node for node in nodes if _local(node.tag) in {"item", "entry"}]
        for entry in entries[:30]:
            title = _findtext(entry, ("title",))
            link = _findtext(entry, ("link", "id"))
            if not link:
                link_node = next((child for child in entry if _local(child.tag) == "link"), None)
                if link_node is not None:
                    link = link_node.attrib.get("href") or (link_node.text or "")
            summary = _findtext(entry, ("summary", "description"))
            published = _findtext(entry, ("published", "updated", "pubDate"))
            if not title:
                continue
            url = (
                link
                if link.startswith("http://") or link.startswith("https://")
                else self.source_url
            )
            payload = {
                "title": title,
                "url": url,
                "summary": summary[:2000],
                "published_at": published,
            }
            items.append(payload)
            event_type = _announcement_type(payload)
            events.append(
                EventEnvelope(
                    event_type=event_type,
                    source=self.name,
                    entity_key=url,
                    occurred_at=collected_at,
                    collected_at=collected_at,
                    payload=payload,
                    importance=Importance(importance_for(event_type.value, payload).value),
                    metadata=EventMetadata(
                        source_url=url,
                        reliability=ReliabilityLevel(self.reliability)
                        if self.reliability in ReliabilityLevel._value2member_map_
                        else ReliabilityLevel.OFFICIAL_DOCUMENT,
                        extraction_method="rss",
                    ),
                )
            )
        return CollectorResult(events=events, raw_payload={"items": items})


class HtmlNewsCollector(BaseCollector):
    def __init__(self, client: Any, source_slug: str) -> None:
        super().__init__(client)
        spec = next(item for item in SOURCE_CATALOG if item.slug == source_slug)
        self.name = spec.slug
        self.source_url = spec.url
        self.reliability = spec.reliability

    async def collect(self) -> CollectorResult:
        response = await self.client.get(self.source_url, headers={"User-Agent": "llm-radar"})
        response.raise_for_status()
        html = response.text
        collected_at = datetime.now(UTC)
        events: list[EventEnvelope] = []
        items: list[dict[str, Any]] = []
        try:
            from selectolax.parser import HTMLParser

            tree = HTMLParser(html)
            anchors = tree.css("a")
        except Exception:
            anchors = []
        seen: set[str] = set()
        for anchor in anchors:
            href = (anchor.attributes.get("href") if hasattr(anchor, "attributes") else "") or ""
            text = " ".join((anchor.text() if hasattr(anchor, "text") else "").split())
            if not href or not text or len(text) < 16:
                continue
            lowered = href.lower()
            if not any(token in lowered for token in ("/blog", "/news", "/research", "/announc")):
                continue
            url = urljoin(self.source_url, href)
            if url in seen:
                continue
            seen.add(url)
            payload = {"title": text[:240], "url": url}
            items.append(payload)
            event_type = _announcement_type(payload)
            events.append(
                EventEnvelope(
                    event_type=event_type,
                    source=self.name,
                    entity_key=url,
                    occurred_at=collected_at,
                    collected_at=collected_at,
                    payload=payload,
                    importance=Importance.MEDIUM,
                    metadata=EventMetadata(
                        source_url=url,
                        reliability=ReliabilityLevel.OFFICIAL_DOCUMENT,
                        extraction_method="html",
                    ),
                )
            )
            if len(events) >= 20:
                break
        return CollectorResult(
            events=events, raw_payload={"items": items, "status": response.status_code}
        )


def rss_sources() -> list[str]:
    return [
        item.slug
        for item in SOURCE_CATALOG
        if item.collection_method == CollectionMethod.RSS and item.is_active
    ]


def html_sources() -> list[str]:
    return [
        item.slug
        for item in SOURCE_CATALOG
        if item.collection_method == CollectionMethod.HTML and item.is_active
    ]
