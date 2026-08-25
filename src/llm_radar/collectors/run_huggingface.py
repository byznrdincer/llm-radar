import asyncio

import httpx

from llm_radar.collectors.framework import publish_collection
from llm_radar.collectors.huggingface import HuggingFaceCollector


async def main() -> None:
    async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
        published = await publish_collection(HuggingFaceCollector(client))
    print(f"Published {published} Hugging Face events")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
