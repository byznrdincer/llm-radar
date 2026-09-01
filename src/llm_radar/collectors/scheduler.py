import asyncio
import logging
from collections.abc import Callable
from typing import cast

import httpx

from llm_radar.collectors.aimlapi import AIMLAPICollector
from llm_radar.collectors.arena import ArenaCollector
from llm_radar.collectors.artificial_analysis import ArtificialAnalysisCollector
from llm_radar.collectors.arxiv import ArxivCollector
from llm_radar.collectors.base import BaseCollector
from llm_radar.collectors.community_benchmarks import LiveBenchCollector, MMLUProCollector
from llm_radar.collectors.framework import collect_once
from llm_radar.collectors.github import GitHubCollector, GitHubOrganizationCollector
from llm_radar.collectors.groqcloud import GroqCloudCollector
from llm_radar.collectors.huggingface import HuggingFaceCollector
from llm_radar.collectors.litellm import LiteLLMCollector
from llm_radar.collectors.lmstudio import LMStudioCollector
from llm_radar.collectors.livecodebench import LiveCodeBenchCollector
from llm_radar.collectors.nanogpt import NanoGPTCollector
from llm_radar.collectors.news import HtmlNewsCollector, RssCollector, html_sources, rss_sources
from llm_radar.collectors.openai_pricing import OpenAIPricingCollector
from llm_radar.collectors.openrouter import OpenRouterCollector
from llm_radar.collectors.ollama import OllamaCollector
from llm_radar.collectors.replicate import ReplicateCollector
from llm_radar.collectors.swebench import SweBenchCollector
from llm_radar.collectors.swebench_live import SweBenchLiveCollector
from llm_radar.collectors.tau_bench import TauBenchCollector
from llm_radar.collectors.vercel_gateway import VercelGatewayCollector
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
        (OpenAIPricingCollector, settings.collector_interval_seconds, 5),
        (VercelGatewayCollector, settings.collector_interval_seconds, 10),
        (AIMLAPICollector, settings.collector_interval_seconds, 15),
        (LiteLLMCollector, settings.collector_interval_seconds, 25),
        (
            lambda client: NanoGPTCollector(client, settings.nanogpt_api_key),
            settings.collector_interval_seconds,
            35,
        ),
        (HuggingFaceCollector, settings.collector_interval_seconds, 20),
        (OllamaCollector, settings.collector_interval_seconds * 2, 55),
        (LMStudioCollector, settings.collector_interval_seconds * 2, 65),
        (GitHubCollector, settings.collector_interval_seconds, 40),
        (
            lambda client: GitHubOrganizationCollector(client, "deepseek", "deepseek-ai"),
            settings.collector_interval_seconds,
            45,
        ),
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
                cast(
                    Callable[[httpx.AsyncClient], BaseCollector],
                    lambda client, name=slug: RssCollector(client, name),
                ),
                settings.collector_interval_seconds,
                offset,
            )
        )
        offset += 15
    for slug in html_sources():
        jobs.append(
            (
                cast(
                    Callable[[httpx.AsyncClient], BaseCollector],
                    lambda client, name=slug: HtmlNewsCollector(client, name),
                ),
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
    if settings.groq_api_key:
        jobs.append(
            (
                lambda client: GroqCloudCollector(client, settings.groq_api_key or ""),
                settings.collector_interval_seconds,
                50,
            )
        )
    if settings.replicate_api_token:
        jobs.append(
            (
                lambda client: ReplicateCollector(client, settings.replicate_api_token or ""),
                settings.collector_interval_seconds,
                70,
            )
        )
    await asyncio.gather(*(run_job(*job) for job in jobs))


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())


if __name__ == "__main__":
    run()
