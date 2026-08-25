from collections import defaultdict
from datetime import UTC, datetime
from statistics import mean
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.community_benchmarks import leaderboard_event

DATA_URL = "https://livecodebench.github.io/performances_generation.json"
SOURCE_URL = "https://livecodebench.github.io/leaderboard.html"


class LiveCodeBenchCollector(BaseCollector):
    name = "livecodebench"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(DATA_URL)
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        date_marks = sorted(payload["date_marks"])
        start = date_marks[15] if len(date_marks) > 15 else date_marks[0]
        end = date_marks[-1]
        model_metadata = {item["model_repr"]: item for item in payload["models"]}
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in payload["performances"]:
            if start <= row["date"] <= end:
                grouped[row["model"]].append(row)

        scored = []
        for model, rows in grouped.items():
            metadata = model_metadata.get(model, {})
            if metadata.get("release_date", 0) >= start:
                continue
            score = mean(float(row["pass@1"]) for row in rows)
            difficulty = {
                level: mean(float(row["pass@1"]) for row in rows if row["difficulty"] == level)
                for level in ("easy", "medium", "hard")
                if any(row["difficulty"] == level for row in rows)
            }
            scored.append((model, score, difficulty, metadata))
        scored.sort(key=lambda item: item[1], reverse=True)
        published = datetime.fromtimestamp(end / 1000, UTC).date().isoformat()
        events = [
            leaderboard_event(
                source=self.name,
                slug="livecodebench-code-generation",
                name="LiveCodeBench Code Generation",
                category="code_generation",
                model=model,
                score=score,
                rank=rank,
                published=published,
                source_url=SOURCE_URL,
                raw={
                    "difficulty_scores": difficulty,
                    "model_url": metadata.get("link"),
                    "evaluation_window_start": datetime.fromtimestamp(start / 1000, UTC)
                    .date()
                    .isoformat(),
                    "evaluation_window_end": published,
                    "prompt_method": "official LiveCodeBench code-generation protocol",
                },
            )
            for rank, (model, score, difficulty, metadata) in enumerate(scored, start=1)
        ]
        return CollectorResult(events=events, raw_payload=payload)
