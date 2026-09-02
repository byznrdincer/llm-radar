import logging

from confluent_kafka import Consumer, KafkaError
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from llm_radar.config import get_settings
from llm_radar.database.models import DeadLetterEvent
from llm_radar.database.session import SessionLocal
from llm_radar.events.producer import EventProducer
from llm_radar.events.schemas import EventEnvelope
from llm_radar.events.topics import DEAD_LETTER, RAW_UPDATES
from llm_radar.observability import EVENTS_INGESTED, PROCESS_SECONDS
from llm_radar.processor.service import process_event

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _persist_dead_letter(payload: bytes | None, error: str) -> None:
    try:
        with SessionLocal() as session:
            session.add(
                DeadLetterEvent(
                    topic=DEAD_LETTER,
                    payload={"raw": payload.decode("utf-8", errors="replace") if payload else None},
                    error=error[:1000],
                )
            )
            session.commit()
    except SQLAlchemyError:
        logger.exception("failed to persist dead letter")


def main() -> None:
    consumer = Consumer(
        {
            "bootstrap.servers": get_settings().kafka_bootstrap_servers,
            "group.id": "llm-radar-processor-v2",
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )
    producer = EventProducer()
    consumer.subscribe([RAW_UPDATES])
    logger.info("processor started; waiting for %s", RAW_UPDATES)

    try:
        while True:
            message = consumer.poll(1.0)
            if message is None:
                continue
            error = message.error()
            if error is not None:
                if error.code() != KafkaError._PARTITION_EOF:
                    logger.error("consumer error: %s", error)
                continue
            try:
                value = message.value()
                if value is None:
                    raise ValueError("Kafka message has no value")
                event = EventEnvelope.model_validate_json(value)
                with PROCESS_SECONDS.time():
                    with SessionLocal() as session:
                        process_event(session, event)
                EVENTS_INGESTED.labels(event_type=event.event_type.value).inc()
                consumer.commit(message=message, asynchronous=False)
            except (ValidationError, ValueError, KeyError, SQLAlchemyError) as exc:
                logger.exception("invalid event: %s", exc)
                producer._producer.produce(  # noqa: SLF001
                    DEAD_LETTER, key=message.key(), value=message.value()
                )
                producer.flush()
                _persist_dead_letter(message.value(), str(exc))
                consumer.commit(message=message, asynchronous=False)
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
