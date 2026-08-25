import asyncio

import httpx

from llm_radar.collectors.artificial_analysis import ArtificialAnalysisCollector
from llm_radar.config import get_settings
from llm_radar.events.producer import EventProducer
from llm_radar.events.topics import RAW_UPDATES


async def main() -> None:
    api_key = get_settings().artificial_analysis_api_key or ""
    async with httpx.AsyncClient(timeout=60.0) as client:
        result = await ArtificialAnalysisCollector(client, api_key).collect()

    producer = EventProducer()
    for event in result.events:
        producer.publish(RAW_UPDATES, event)
    remaining = producer.flush()
    if remaining:
        raise RuntimeError(f"{remaining} event could not be delivered")
    print(f"Published {len(result.events)} Artificial Analysis events to {RAW_UPDATES}")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
