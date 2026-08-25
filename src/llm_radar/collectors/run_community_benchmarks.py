import asyncio

import httpx

from llm_radar.collectors.community_benchmarks import LiveBenchCollector, MMLUProCollector
from llm_radar.events.producer import EventProducer
from llm_radar.events.topics import RAW_UPDATES


async def main() -> None:
    async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
        results = await asyncio.gather(
            LiveBenchCollector(client).collect(), MMLUProCollector(client).collect()
        )
    producer = EventProducer()
    total = 0
    for result in results:
        total += len(result.events)
        for event in result.events:
            producer.publish(RAW_UPDATES, event)
    remaining = producer.flush(30)
    if remaining:
        raise RuntimeError(f"{remaining} events could not be delivered")
    print(f"Published {total} LiveBench and MMLU-Pro events to {RAW_UPDATES}")


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
