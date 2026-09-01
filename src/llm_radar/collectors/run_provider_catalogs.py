import asyncio
from collections.abc import Callable

import httpx

from llm_radar.collectors.aimlapi import AIMLAPICollector
from llm_radar.collectors.base import BaseCollector
from llm_radar.collectors.framework import collect_once
from llm_radar.collectors.groqcloud import GroqCloudCollector
from llm_radar.collectors.litellm import LiteLLMCollector
from llm_radar.collectors.nanogpt import NanoGPTCollector
from llm_radar.collectors.replicate import ReplicateCollector
from llm_radar.collectors.vercel_gateway import VercelGatewayCollector
from llm_radar.config import get_settings


async def main() -> None:
    settings = get_settings()
    factories: list[Callable[[httpx.AsyncClient], BaseCollector]] = [
        VercelGatewayCollector,
        AIMLAPICollector,
        LiteLLMCollector,
        lambda client: NanoGPTCollector(client, settings.nanogpt_api_key),
    ]
    if settings.groq_api_key:
        factories.append(lambda client: GroqCloudCollector(client, settings.groq_api_key or ""))
    if settings.replicate_api_token:
        factories.append(
            lambda client: ReplicateCollector(client, settings.replicate_api_token or "")
        )
    counts = await asyncio.gather(*(collect_once(factory) for factory in factories))
    print(f"Published {sum(counts)} model catalog events from {len(factories)} sources")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
