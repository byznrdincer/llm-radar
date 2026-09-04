import asyncio
import logging
from collections.abc import Callable
from typing import cast

import httpx

from llm_radar.catalog import SOURCE_BY_SLUG
from llm_radar.collectors.aimlapi import AIMLAPICollector
from llm_radar.collectors.arena import ArenaCollector
from llm_radar.collectors.artificial_analysis import ArtificialAnalysisCollector
from llm_radar.collectors.arxiv import ArxivCollector
from llm_radar.collectors.base import BaseCollector
from llm_radar.collectors.bifrost import BifrostCollector
from llm_radar.collectors.cloudflare_workers_ai import CloudflareWorkersAICollector
from llm_radar.collectors.community_benchmarks import LiveBenchCollector, MMLUProCollector
from llm_radar.collectors.deepinfra import DeepInfraCollector
from llm_radar.collectors.fireworks import FireworksCollector
from llm_radar.collectors.framework import collect_once
from llm_radar.collectors.github import GitHubCollector, GitHubOrganizationCollector
from llm_radar.collectors.groqcloud import GroqCloudCollector
from llm_radar.collectors.huggingface import HuggingFaceCollector
from llm_radar.collectors.litellm import LiteLLMCollector
from llm_radar.collectors.livecodebench import LiveCodeBenchCollector
from llm_radar.collectors.lmstudio import LMStudioCollector
from llm_radar.collectors.nanogpt import NanoGPTCollector
from llm_radar.collectors.news import HtmlNewsCollector, RssCollector, html_sources, rss_sources
from llm_radar.collectors.ollama import OllamaCollector
from llm_radar.collectors.openai_pricing import OpenAIPricingCollector
from llm_radar.collectors.openrouter import OpenRouterCollector
from llm_radar.collectors.replicate import ReplicateCollector
from llm_radar.collectors.swebench import SweBenchCollector
from llm_radar.collectors.swebench_live import SweBenchLiveCollector
from llm_radar.collectors.tau_bench import TauBenchCollector
from llm_radar.collectors.together import TogetherCollector
from llm_radar.collectors.vercel_gateway import VercelGatewayCollector
from llm_radar.config import get_settings

logger = logging.getLogger(__name__)


def source_interval(slug: str, fallback: int) -> int:
    spec = SOURCE_BY_SLUG.get(slug)
    return spec.check_interval_seconds if spec is not None else fallback


async def run_job(
    factory: Callable[[httpx.AsyncClient], BaseCollector], interval_seconds: int, delay: int
) -> None:
    await asyncio.sleep(delay)
    while True:
        await collect_once(factory)
        await asyncio.sleep(interval_seconds)


async def refresh_read_model_job(interval_seconds: int, delay: int) -> None:
    """Rebuild model_profiles.general_score / effective_openness and the
    per-focus model_focus_scores table on the benchmark cadence so the event
    feed and model search filter and sort in SQL."""
    await asyncio.sleep(delay)
    while True:
        try:
            from llm_radar.database.session import SessionLocal
            from llm_radar.read_model import refresh_focus_scores, refresh_read_model

            def _run() -> tuple[int, int, int]:
                with SessionLocal() as session:
                    result = refresh_read_model(session)
                    focus_rows = refresh_focus_scores(session)
                    session.commit()
                    return result.scanned, result.updated, focus_rows

            scanned, updated, focus_rows = await asyncio.to_thread(_run)
            logger.info(
                "read model refresh: %s scanned, %s updated, %s focus scores",
                scanned,
                updated,
                focus_rows,
            )
        except Exception:
            logger.exception("read model refresh failed")
        await asyncio.sleep(interval_seconds)


async def main() -> None:
    settings = get_settings()
    jobs: list[tuple[Callable[[httpx.AsyncClient], BaseCollector], int, int]] = [
        (
            OpenRouterCollector,
            source_interval("openrouter", settings.collector_interval_seconds),
            0,
        ),
        (
            OpenAIPricingCollector,
            source_interval("openai-pricing", settings.collector_interval_seconds),
            5,
        ),
        (
            VercelGatewayCollector,
            source_interval("vercel-ai-gateway", settings.collector_interval_seconds),
            10,
        ),
        (AIMLAPICollector, source_interval("aimlapi", settings.collector_interval_seconds), 15),
        (LiteLLMCollector, source_interval("litellm", settings.collector_interval_seconds), 25),
        (DeepInfraCollector, source_interval("deepinfra", settings.collector_interval_seconds), 27),
        (BifrostCollector, source_interval("bifrost", settings.collector_interval_seconds), 29),
        (
            lambda client: FireworksCollector(client, settings.fireworks_api_key),
            source_interval("fireworks", settings.collector_interval_seconds),
            85,
        ),
        (
            lambda client: CloudflareWorkersAICollector(
                client,
                settings.cloudflare_account_id,
                settings.cloudflare_api_token,
            ),
            source_interval("cloudflare-workers-ai", settings.collector_interval_seconds),
            95,
        ),
        (
            lambda client: NanoGPTCollector(client, settings.nanogpt_api_key),
            source_interval("nanogpt", settings.collector_interval_seconds),
            35,
        ),
        (
            HuggingFaceCollector,
            source_interval("huggingface", settings.collector_interval_seconds),
            20,
        ),
        (OllamaCollector, source_interval("ollama", settings.collector_interval_seconds), 55),
        (LMStudioCollector, source_interval("lmstudio", settings.collector_interval_seconds), 65),
        (GitHubCollector, source_interval("github", settings.collector_interval_seconds), 40),
        (
            lambda client: GitHubOrganizationCollector(client, "deepseek", "deepseek-ai"),
            source_interval("deepseek", settings.collector_interval_seconds),
            45,
        ),
        (ArxivCollector, source_interval("arxiv", settings.collector_interval_seconds), 80),
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
        interval = SOURCE_BY_SLUG[slug].check_interval_seconds
        initial_delay = 12 if slug == "google-gemini-blog" else offset
        jobs.append(
            (
                cast(
                    Callable[[httpx.AsyncClient], BaseCollector],
                    lambda client, name=slug: RssCollector(client, name),
                ),
                interval,
                initial_delay,
            )
        )
        if slug != "google-gemini-blog":
            offset += 15
    for slug in html_sources():
        interval = SOURCE_BY_SLUG[slug].check_interval_seconds
        jobs.append(
            (
                cast(
                    Callable[[httpx.AsyncClient], BaseCollector],
                    lambda client, name=slug: HtmlNewsCollector(client, name),
                ),
                interval,
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
                source_interval("groqcloud", settings.collector_interval_seconds),
                50,
            )
        )
    if settings.replicate_api_token:
        jobs.append(
            (
                lambda client: ReplicateCollector(client, settings.replicate_api_token or ""),
                source_interval("replicate", settings.collector_interval_seconds),
                70,
            )
        )
    if settings.together_api_key:
        jobs.append(
            (
                lambda client: TogetherCollector(client, settings.together_api_key or ""),
                source_interval("together", settings.collector_interval_seconds),
                75,
            )
        )
    await asyncio.gather(
        *(run_job(*job) for job in jobs),
        refresh_read_model_job(settings.benchmark_interval_seconds, 300),
    )


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())


if __name__ == "__main__":
    run()
