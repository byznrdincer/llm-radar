import asyncio

import httpx

from llm_radar.collectors.framework import publish_collection
from llm_radar.collectors.ollama import OllamaCollector


async def main() -> None:
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        published = await publish_collection(OllamaCollector(client))
    print(f"Published {published} Ollama events")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
