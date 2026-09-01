import asyncio

import httpx

from llm_radar.collectors.framework import publish_collection
from llm_radar.collectors.lmstudio import LMStudioCollector


async def main() -> None:
    async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
        published = await publish_collection(LMStudioCollector(client))
    print(f"Published {published} LM Studio events")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
