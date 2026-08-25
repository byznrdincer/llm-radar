import asyncio

import httpx

from llm_radar.collectors.openrouter import OpenRouterCollector
from llm_radar.events.producer import EventProducer
from llm_radar.events.topics import RAW_UPDATES


async def main() -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        result = await OpenRouterCollector(client).collect()

    producer = EventProducer()
    for event in result.events:
        producer.publish(RAW_UPDATES, event)
    remaining = producer.flush()
    if remaining:
        raise RuntimeError(f"{remaining} event could not be delivered")
    print(f"Published {len(result.events)} OpenRouter model events to {RAW_UPDATES}")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
