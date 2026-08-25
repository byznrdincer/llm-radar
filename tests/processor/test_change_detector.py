from decimal import Decimal

from llm_radar.events.schemas import EventType
from llm_radar.processor.change_detector import detect_changes


def test_detects_context_and_price_changes() -> None:
    old = {
        "context_window": 100_000,
        "pricing": {"input_per_1m_tokens": "2", "output_per_1m_tokens": "4"},
    }
    new = {
        "context_window": 200_000,
        "pricing": {"input_per_1m_tokens": "1.5", "output_per_1m_tokens": "4"},
    }

    changes = detect_changes(old, new)

    assert [change.event_type for change in changes] == [
        EventType.CONTEXT_CHANGED,
        EventType.PRICE_CHANGED,
    ]
    assert changes[0].percentage == Decimal("100.0000")
    assert changes[1].percentage == Decimal("-25.0000")


def test_returns_no_changes_for_equal_snapshots() -> None:
    snapshot = {"context_window": 128_000, "pricing": {"input_per_1m_tokens": "1"}}
    assert detect_changes(snapshot, snapshot) == []


def test_detects_cache_price_change() -> None:
    changes = detect_changes(
        {"pricing": {"cache_read_per_1m_tokens": "1"}},
        {"pricing": {"cache_read_per_1m_tokens": "0.5"}},
    )
    assert changes[0].event_type == EventType.CACHE_PRICE_CHANGED


def test_open_weight_release_is_detected() -> None:
    changes = detect_changes({"is_open_weight": False}, {"is_open_weight": True})
    assert [change.event_type for change in changes] == [EventType.WEIGHTS_RELEASED]


def test_non_numeric_price_change_does_not_crash() -> None:
    changes = detect_changes(
        {"pricing": {"input_per_1m_tokens": "unknown"}},
        {"pricing": {"input_per_1m_tokens": "1.25"}},
    )
    assert len(changes) == 1
    assert changes[0].percentage is None
