from datetime import UTC, datetime

from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    ReliabilityLevel,
)


def test_event_envelope_serializes_with_version_and_metadata() -> None:
    event = EventEnvelope(
        event_type=EventType.PRICE_CHANGED,
        source="openrouter",
        entity_key="openai/example",
        occurred_at=datetime.now(UTC),
        payload={"old": 2.0, "new": 1.5},
        metadata=EventMetadata(
            source_url="https://openrouter.ai/models",
            reliability=ReliabilityLevel.THIRD_PARTY,
        ),
    )

    payload = event.model_dump(mode="json")

    assert payload["schema_version"] == 1
    assert payload["event_type"] == "price.changed"
    assert payload["metadata"]["reliability"] == "third_party"
