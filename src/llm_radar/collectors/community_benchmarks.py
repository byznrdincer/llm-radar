import csv
import io
import re
from datetime import UTC, datetime
from statistics import mean
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.events.schemas import EventEnvelope, EventMetadata, EventType, ReliabilityLevel

LIVEBENCH_CONTENTS_URL = (
    "https://api.github.com/repos/LiveBench/livebench.github.io/contents/public"
)
MMLU_PRO_ROWS_URL = "https://datasets-server.huggingface.co/rows"

LIVEBENCH_CATEGORIES = {
    "coding": {"code_completion", "code_generation"},
    "data_analysis": {"consecutive_events", "tablejoin", "tablereformat"},
    "math": {"AMPS_Hard", "integrals_with_game", "math_comp", "olympiad", "simplify"},
    "reasoning": {"logic_with_navigation", "spatial", "theory_of_mind", "zebra_puzzle"},
    "writing": {"connections", "plot_unscrambling", "typos"},
    "instruction_following": {"paraphrase", "story_generation", "summarize"},
    "agentic_coding": {"javascript", "python", "typescript"},
}

MMLU_PRO_SUBJECTS = {
    "biology": "Biology",
    "business": "Business",
    "chemistry": "Chemistry",
    "computer_science": "Computer Science",
    "economics": "Economics",
    "engineering": "Engineering",
    "health": "Health",
    "history": "History",
    "law": "Law",
    "math": "Math",
    "philosophy": "Philosophy",
    "physics": "Physics",
    "psychology": "Psychology",
    "other": "Other",
}


def numeric(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def infer_organization(name: str) -> str:
    lowered = name.lower()
    signals = {
        "claude": "Anthropic",
        "gpt": "OpenAI",
        "o1": "OpenAI",
        "o3": "OpenAI",
        "o4": "OpenAI",
        "gemini": "Google",
        "grok": "SpaceXAI",
        "qwen": "Alibaba",
        "kimi": "Moonshot AI",
        "deepseek": "DeepSeek",
        "llama": "Meta",
        "mistral": "Mistral AI",
        "glm": "Z AI",
    }
    return next((org for signal, org in signals.items() if signal in lowered), "Unknown")


def leaderboard_event(
    *,
    source: str,
    slug: str,
    name: str,
    category: str,
    model: str,
    score: float,
    rank: int,
    published: str,
    source_url: str,
    raw: dict[str, Any],
) -> EventEnvelope:
    collected_at = datetime.now(UTC)
    payload = {
        "benchmark_slug": slug,
        "benchmark_name": name,
        "category": category,
        "model_name": model,
        "organization": infer_organization(model),
        "license": "Unknown",
        "rating": score,
        "rating_lower": None,
        "rating_upper": None,
        "vote_count": None,
        "rank": rank,
        "leaderboard_publish_date": published,
        "protocol": {
            "score_unit": "percent",
            "evaluation_date": published,
            "measured_by": source,
            "source_class": "academic",
            "verified": True,
            "prompt_method": raw.get("prompt_method"),
            "temperature": raw.get("temperature"),
            "token_budget": raw.get("token_budget"),
            "agent_harness": raw.get("agent_harness"),
            "tools": raw.get("tools"),
        },
        **raw,
    }
    return EventEnvelope(
        event_type=EventType.LEADERBOARD_CHANGED,
        source=source,
        entity_key=f"{source}/{category}/{model}",
        occurred_at=collected_at,
        collected_at=collected_at,
        payload=payload,
        metadata=EventMetadata(source_url=source_url, reliability=ReliabilityLevel.ACADEMIC),
    )


class LiveBenchCollector(BaseCollector):
    name = "livebench"

    async def collect(self) -> CollectorResult:
        listing_response = await self.client.get(LIVEBENCH_CONTENTS_URL)
        listing_response.raise_for_status()
        listing: list[dict[str, Any]] = listing_response.json()
        tables = [
            item for item in listing if re.fullmatch(r"table_\d{4}_\d{2}_\d{2}\.csv", item["name"])
        ]
        latest = max(tables, key=lambda item: item["name"])
        response = await self.client.get(latest["download_url"])
        response.raise_for_status()
        rows = list(csv.DictReader(io.StringIO(response.text)))
        published = latest["name"].removeprefix("table_").removesuffix(".csv").replace("_", "-")
        scored = []
        for row in rows:
            values = [
                parsed
                for key, value in row.items()
                if key != "model" and (parsed := numeric(value)) is not None
            ]
            if values:
                scored.append((row, mean(values)))
        scored.sort(key=lambda item: item[1], reverse=True)
        events = [
            leaderboard_event(
                source=self.name,
                slug="livebench-overall",
                name="LiveBench Overall",
                category="general",
                model=row["model"],
                score=score,
                rank=rank,
                published=published,
                source_url="https://livebench.ai/",
                raw={"release": published, "task_scores": row},
            )
            for rank, (row, score) in enumerate(scored, start=1)
        ]
        for category, tasks in LIVEBENCH_CATEGORIES.items():
            category_rows = []
            for row in rows:
                values = [
                    parsed for task in tasks if (parsed := numeric(row.get(task))) is not None
                ]
                if values:
                    category_rows.append((row, mean(values)))
            category_rows.sort(key=lambda item: item[1], reverse=True)
            events.extend(
                leaderboard_event(
                    source=self.name,
                    slug=f"livebench-{category}",
                    name=f"LiveBench {category.replace('_', ' ').title()}",
                    category=category,
                    model=row["model"],
                    score=score,
                    rank=rank,
                    published=published,
                    source_url="https://livebench.ai/",
                    raw={
                        "release": published,
                        "task_scores": {task: row.get(task) for task in tasks},
                    },
                )
                for rank, (row, score) in enumerate(category_rows, start=1)
            )
        return CollectorResult(events=events, raw_payload=rows)


class MMLUProCollector(BaseCollector):
    name = "mmlu-pro"

    async def collect(self) -> CollectorResult:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            response = await self.client.get(
                MMLU_PRO_ROWS_URL,
                params={
                    "dataset": "TIGER-Lab/mmlu_pro_leaderboard_submission",
                    "config": "default",
                    "split": "train",
                    "offset": offset,
                    "length": 100,
                },
            )
            response.raise_for_status()
            payload = response.json()
            rows.extend(item["row"] for item in payload["rows"])
            offset += len(payload["rows"])
            if offset >= payload["num_rows_total"] or not payload["rows"]:
                break
        scored = sorted(rows, key=lambda row: float(row["Overall"]), reverse=True)
        published = datetime.now(UTC).date().isoformat()
        events = [
            leaderboard_event(
                source=self.name,
                slug="mmlu-pro-overall",
                name="MMLU-Pro Overall",
                category="knowledge",
                model=row["Models"],
                score=float(row["Overall"]) * 100,
                rank=rank,
                published=published,
                source_url="https://huggingface.co/spaces/TIGER-Lab/MMLU-Pro",
                raw={"evaluation_source": row.get("Data Source"), "subject_scores": row},
            )
            for rank, row in enumerate(scored, start=1)
        ]
        for category, field in MMLU_PRO_SUBJECTS.items():
            subject_rows = [row for row in rows if numeric(row.get(field)) is not None]
            subject_rows.sort(key=lambda row: numeric(row[field]) or 0, reverse=True)
            events.extend(
                leaderboard_event(
                    source=self.name,
                    slug=f"mmlu-pro-{category}",
                    name=f"MMLU-Pro {field}",
                    category=category,
                    model=row["Models"],
                    score=(numeric(row[field]) or 0) * 100,
                    rank=rank,
                    published=published,
                    source_url="https://huggingface.co/spaces/TIGER-Lab/MMLU-Pro",
                    raw={"evaluation_source": row.get("Data Source"), "subject": field},
                )
                for rank, row in enumerate(subject_rows, start=1)
            )
        return CollectorResult(events=events, raw_payload=rows)
