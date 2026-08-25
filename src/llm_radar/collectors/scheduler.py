import asyncio
import logging
from collections.abc import Callable

import httpx

from llm_radar.collectors.arena import ArenaCollector
from llm_radar.collectors.artificial_analysis import ArtificialAnalysisCollector
from llm_radar.collectors.arxiv import ArxivCollector
from llm_radar.collectors.base import BaseCollector
from llm_radar.collectors.community_benchmarks import LiveBenchCollector, MMLUProCollector
from llm_radar.collectors.framework import collect_once
from llm_radar.collectors.github import GitHubCollector
from llm_radar.collectors.huggingface import HuggingFaceCollector
from llm_radar.collectors.livecodebench import LiveCodeBenchCollector
from llm_radar.collectors.news import HtmlNewsCollector, RssCollector, html_sources, rss_sources
from llm_radar.collectors.openrouter import OpenRouterCollector
from llm_radar.collectors.swebench import SweBenchCollector
from llm_radar.collectors.swebench_live import SweBenchLiveCollector
from llm_radar.collectors.tau_bench import TauBenchCollector
from llm_radar.config import get_settings

logger = logging.getLogger(__name__)


async def run_job(
    factory: Callable[[httpx.AsyncClient], BaseCollector], interval_seconds: int, delay: int
) -> None:
    await asyncio.sleep(delay)
    while True:
        await collect_once(factory)
        await asyncio.sleep(interval_seconds)


async def main() -> None:
    settings = get_settings()
    jobs: list[tuple[Callable[[httpx.AsyncClient], BaseCollector], int, int]] = [
        (OpenRouterCollector, settings.collector_interval_seconds, 0),
        (HuggingFaceCollector, settings.collector_interval_seconds, 20),
        (GitHubCollector, settings.collector_interval_seconds, 40),
        (ArxivCollector, settings.collector_interval_seconds, 80),
        (ArenaCollector, settings.benchmark_interval_seconds, 30),
        (SweBenchCollector, settings.benchmark_interval_seconds, 60),
        (LiveBenchCollector, settings.benchmark_interval_seconds, 120),
        (MMLUProCollector, settings.benchmark_interval_seconds, 150),
        (LiveCodeBenchCollector, settings.benchmark_interval_seconds, 180),
        (SweBenchLiveCollector, settings.benchmark_interval_seconds, 210),
        (TauBenchCollector, settings.benchmark_interval_seconds, 240),
    ]
    offset = 260
    for slug in rss_sources():
        jobs.append(
            (
                lambda client, name=slug: RssCollector(client, name),
                settings.collector_interval_seconds,
                offset,
            )
        )
        offset += 15
    for slug in html_sources():
        jobs.append(
            (
                lambda client, name=slug: HtmlNewsCollector(client, name),
                settings.collector_interval_seconds,
                offset,
            )
        )
        offset += 20
    if settings.artificial_analysis_api_key:
        jobs.append(
            (
                lambda client: ArtificialAnalysisCollector(
                    client, settings.artificial_analysis_api_key or ""
                ),
                settings.benchmark_interval_seconds,
                90,
            )
        )
    await asyncio.gather(*(run_job(*job) for job in jobs))


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())


if __name__ == "__main__":
    run()
