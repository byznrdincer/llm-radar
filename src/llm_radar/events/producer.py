from collections.abc import Callable

from confluent_kafka import Producer

from llm_radar.config import get_settings
from llm_radar.events.schemas import EventEnvelope


class EventProducer:
    def __init__(self, producer: Producer | None = None) -> None:
        self._producer = producer or Producer(
            {
                "bootstrap.servers": get_settings().kafka_bootstrap_servers,
                "client.id": "llm-radar",
                "enable.idempotence": True,
                "acks": "all",
            }
        )

    def publish(
        self,
        topic: str,
        event: EventEnvelope,
        on_delivery: Callable[..., None] | None = None,
    ) -> None:
        self._producer.produce(
            topic=topic,
            key=event.entity_key.encode(),
            value=event.model_dump_json().encode(),
            on_delivery=on_delivery,
        )
        self._producer.poll(0)

    def flush(self, timeout: float = 10.0) -> int:
        return self._producer.flush(timeout)
