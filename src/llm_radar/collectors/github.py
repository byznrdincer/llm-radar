from datetime import UTC, datetime
from typing import Any

from llm_radar.catalog import TECHNOLOGY_KEYWORDS, WATCHED_GITHUB_REPOS, importance_for
from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.config import get_settings
from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    Importance,
    ReliabilityLevel,
)


class GitHubOrganizationCollector(BaseCollector):
    """Track official organization repositories and update that source's health."""

    def __init__(self, client: Any, source_slug: str, organization: str) -> None:
        super().__init__(client)
        self.name = source_slug
        self.organization = organization

    async def collect(self) -> CollectorResult:
        collected_at = datetime.now(UTC)
        response = await self.client.get(
            f"https://api.github.com/orgs/{self.organization}/repos",
            params={"sort": "updated", "direction": "desc", "per_page": 30},
            headers=_headers(),
        )
        response.raise_for_status()
        repositories = [item for item in response.json() if isinstance(item, dict)]
        events = []
        for repository in repositories:
            full_name = str(repository.get("full_name") or "")
            url = str(repository.get("html_url") or "")
            if not full_name or not url:
                continue
            payload = {
                "title": f"{full_name} repository updated",
                "repository": full_name,
                "description": repository.get("description"),
                "updated_at": repository.get("updated_at"),
                "url": url,
            }
            events.append(
                EventEnvelope(
                    event_type=EventType.COMPANY_ANNOUNCEMENT,
                    source=self.name,
                    entity_key=full_name,
                    occurred_at=collected_at,
                    collected_at=collected_at,
                    payload=payload,
                    importance=Importance.MEDIUM,
                    metadata=EventMetadata(
                        source_url=url,
                        reliability=ReliabilityLevel.OFFICIAL_API,
                        extraction_method="github_api",
                    ),
                )
            )
        return CollectorResult(events=events, raw_payload={"repositories": repositories})


def _headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "llm-radar"}
    token = get_settings().github_token
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _signals(text: str) -> list[str]:
    lowered = text.lower()
    return [
        slug
        for slug, words in TECHNOLOGY_KEYWORDS.items()
        if any(word in lowered for word in words)
    ]


class GitHubCollector(BaseCollector):
    name = "github"

    async def collect(self) -> CollectorResult:
        collected_at = datetime.now(UTC)
        events: list[EventEnvelope] = []
        raw: list[dict[str, Any]] = []
        for repo in WATCHED_GITHUB_REPOS:
            response = await self.client.get(
                f"https://api.github.com/repos/{repo}/releases",
                params={"per_page": 5},
                headers=_headers(),
            )
            if response.status_code == 404:
                continue
            response.raise_for_status()
            for release in response.json():
                tag = str(release.get("tag_name") or release.get("id"))
                body = str(release.get("body") or "")
                html_url = str(release.get("html_url") or f"https://github.com/{repo}")
                payload = {
                    "repository": repo,
                    "tag": tag,
                    "name": release.get("name") or tag,
                    "published_at": release.get("published_at"),
                    "prerelease": release.get("prerelease", False),
                    "url": html_url,
                    "technology_signals": _signals(f"{tag} {body}"),
                }
                raw.append(payload)
                events.append(
                    EventEnvelope(
                        event_type=EventType.GITHUB_RELEASE_PUBLISHED,
                        source=self.name,
                        entity_key=f"{repo}@{tag}",
                        occurred_at=collected_at,
                        collected_at=collected_at,
                        payload=payload,
                        importance=Importance(
                            importance_for("github.release_published", payload).value
                        ),
                        metadata=EventMetadata(
                            source_url=html_url,
                            reliability=ReliabilityLevel.OFFICIAL_API,
                            extraction_method="github_api",
                        ),
                    )
                )
                for signal in payload["technology_signals"]:
                    events.append(
                        EventEnvelope(
                            event_type=EventType.TECHNOLOGY_DETECTED,
                            source=self.name,
                            entity_key=signal,
                            occurred_at=collected_at,
                            collected_at=collected_at,
                            payload={
                                "signal": signal,
                                "repository": repo,
                                "tag": tag,
                                "url": html_url,
                            },
                            importance=Importance.MEDIUM,
                            metadata=EventMetadata(
                                source_url=html_url,
                                reliability=ReliabilityLevel.OFFICIAL_API,
                                extraction_method="keyword",
                            ),
                        )
                    )
        return CollectorResult(events=events, raw_payload={"releases": raw})
