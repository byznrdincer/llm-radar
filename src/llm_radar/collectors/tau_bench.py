from datetime import UTC, datetime
from typing import Any

from llm_radar.collectors.base import BaseCollector, CollectorResult
from llm_radar.collectors.community_benchmarks import leaderboard_event

BASE_URL = "https://sierra-tau-bench-public.s3.us-west-2.amazonaws.com/submissions"
SOURCE_URL = "https://taubench.com/leaderboard"


class TauBenchCollector(BaseCollector):
    name = "tau-bench"

    async def collect(self) -> CollectorResult:
        response = await self.client.get(f"{BASE_URL}/manifest.json")
        response.raise_for_status()
        manifest = response.json()
        submission_ids = [
            *(manifest.get("submissions") or []),
            *(manifest.get("legacy_submissions") or []),
            *(manifest.get("voice_submissions") or []),
        ]
        submissions: list[dict[str, Any]] = []
        for submission_id in submission_ids:
            item_response = await self.client.get(f"{BASE_URL}/{submission_id}/submission.json")
            if item_response.is_success:
                item = item_response.json()
                item["submission_id"] = submission_id
                submissions.append(item)

        snapshot_date = max(
            (item.get("submission_date", "") for item in submissions),
            default=datetime.now(UTC).date().isoformat(),
        )
        events = []
        domains = sorted({domain for item in submissions for domain in (item.get("results") or {})})
        for domain in domains:
            scored = []
            for item in submissions:
                result = (item.get("results") or {}).get(domain) or {}
                if result.get("pass_1") is None:
                    continue
                effort = item.get("reasoning_effort")
                display_name = item["model_name"] + (f" ({effort})" if effort else "")
                scored.append((item, display_name, float(result["pass_1"]), result))
            scored.sort(key=lambda entry: entry[2], reverse=True)
            for rank, (item, display_name, score, result) in enumerate(scored, start=1):
                events.append(
                    leaderboard_event(
                        source=self.name,
                        slug=f"tau-bench-{domain}",
                        name=f"τ-bench {domain.replace('_', ' ').title()}",
                        category=domain,
                        model=display_name,
                        score=score,
                        rank=rank,
                        published=snapshot_date,
                        source_url=SOURCE_URL,
                        raw={
                            "organization": item.get("model_organization") or "Unknown",
                            "submission_date": item.get("submission_date"),
                            "submission_id": item.get("submission_id"),
                            "pass_at_k": result,
                            "reasoning_effort": effort,
                            "benchmark_version": (item.get("methodology") or {}).get(
                                "tau2_bench_version"
                            ),
                            "prompt_method": "official τ-bench submission protocol",
                            "agent_harness": "τ-bench standard scaffold",
                            "tools": True,
                        },
                    )
                )
        return CollectorResult(events=events, raw_payload=submissions)
