import asyncio

import httpx

from llm_radar.collectors.arxiv import ArxivCollector
from llm_radar.collectors.framework import publish_collection


async def main() -> None:
    async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
        published = await publish_collection(ArxivCollector(client))
    print(f"Published {published} arXiv events")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
