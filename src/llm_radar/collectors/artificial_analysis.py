from datetime import UTC, datetime
from typing import Any

import httpx

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.events.schemas import EventEnvelope, EventMetadata, EventType, ReliabilityLevel

ARTIFICIAL_ANALYSIS_MODELS_URL = "https://artificialanalysis.ai/api/v2/language/models/free"
ARTIFICIAL_ANALYSIS_SOURCE_URL = "https://artificialanalysis.ai/"

METRICS = {
    "intelligence": "artificial_analysis_intelligence_index",
    "coding": "artificial_analysis_coding_index",
    "agentic": "artificial_analysis_agentic_index",
}


class ArtificialAnalysisCollector(BaseCollector):
    name = "artificial-analysis"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        super().__init__(client)
        if not api_key.strip():
            raise ValueError("ARTIFICIAL_ANALYSIS_API_KEY is required")
        self.api_key = api_key

    async def collect(self) -> CollectorResult:
        page = 1
        models: list[dict[str, Any]] = []
        envelopes: list[dict[str, Any]] = []
        while True:
            response = await self.client.get(
                ARTIFICIAL_ANALYSIS_MODELS_URL,
                params={"page": page},
                headers={"x-api-key": self.api_key},
            )
            response.raise_for_status()
            envelope: dict[str, Any] = response.json()
            envelopes.append(envelope)
            models.extend(envelope.get("data", []))
            if not envelope.get("pagination", {}).get("has_more"):
                break
            page += 1

        collected_at = datetime.now(UTC)
        version = str(envelopes[0].get("intelligence_index_version") or "unknown")
        events: list[EventEnvelope] = []
        for metric, field in METRICS.items():
            ranked = [
                model for model in models if (model.get("evaluations") or {}).get(field) is not None
            ]
            ranked.sort(
                key=lambda model: float((model.get("evaluations") or {})[field]),
                reverse=True,
            )
            events.extend(
                self._to_event(model, metric, field, rank, version, collected_at)
                for rank, model in enumerate(ranked, start=1)
            )
        return CollectorResult(events=events, raw_payload=envelopes)

    def _to_event(
        self,
        model: dict[str, Any],
        metric: str,
        field: str,
        rank: int,
        version: str,
        collected_at: datetime,
    ) -> EventEnvelope:
        creator = model.get("model_creator") or {}
        open_weights = model.get("open_weights") if "open_weights" in model else None
        payload = {
            "benchmark_slug": f"artificial-analysis-{metric}",
            "benchmark_name": f"Artificial Analysis {metric.title()} Index v{version}",
            "benchmark_version": version,
            "model_name": model["name"],
            "model_slug": model.get("slug"),
            "open_weights": open_weights,
            "organization": creator.get("name") or "Unknown",
            "license": (
                "Open" if open_weights is True else "Proprietary" if open_weights is False else None
            ),
            "category": metric,
            "rating": (model.get("evaluations") or {})[field],
            "rating_lower": None,
            "rating_upper": None,
            "vote_count": None,
            "rank": rank,
            "leaderboard_publish_date": collected_at.date().isoformat(),
            "release_date": model.get("release_date"),
            "reasoning_model": model.get("reasoning_model"),
            "pricing": model.get("pricing"),
            "performance": model.get("performance"),
            "evaluations": model.get("evaluations"),
        }
        return EventEnvelope(
            event_type=EventType.LEADERBOARD_CHANGED,
            source=self.name,
            entity_key=f"artificial-analysis/{metric}/{model.get('slug') or model['id']}",
            occurred_at=collected_at,
            collected_at=collected_at,
            payload=payload,
            metadata=EventMetadata(
                source_url=ARTIFICIAL_ANALYSIS_SOURCE_URL,
                reliability=ReliabilityLevel.INDEPENDENT_MEASUREMENT,
            ),
        )
