from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from llm_radar.outbox_worker import _apply_delivery_results, _deliver, _OutboxItem


class FakeProducer:
    """Records produce() calls and fires delivery callbacks on flush()."""

    def __init__(self, *, fail_topics: set[str] | None = None) -> None:
        self.fail_topics = fail_topics or set()
        self.produced: list[tuple[str, bytes]] = []
        self._pending: list[tuple[Any, str]] = []
        self.flush_calls = 0

    def produce(
        self, topic: str, *, key: bytes, value: bytes, on_delivery: Any
    ) -> None:
        self.produced.append((topic, value))
        self._pending.append((on_delivery, topic))

    def flush(self, _timeout: float) -> int:
        self.flush_calls += 1
        for callback, topic in self._pending:
            err = RuntimeError("broker down") if topic in self.fail_topics else None
            callback(err, None)
        self._pending.clear()
        return 0

    def poll(self, _timeout: float) -> int:  # pragma: no cover - not exercised here
        return 0


def _item(topic: str = "llm.raw") -> _OutboxItem:
    return _OutboxItem(id=uuid4(), topic=topic, event_key="k", payload={"a": 1})


def _row(topic: str = "llm.raw", attempts: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), topic=topic, event_key="k", payload={"a": 1},
        status="pending", attempts=attempts, published_at=None, last_error=None,
    )


def test_deliver_flushes_once_for_the_whole_batch() -> None:
    producer = FakeProducer()
    items = [_item() for _ in range(5)]

    results = _deliver(producer, items)

    assert producer.flush_calls == 1
    assert len(producer.produced) == 5
    assert all(results[item.id] is None for item in items)


def test_deliver_reports_the_failure_reason() -> None:
    producer = FakeProducer(fail_topics={"llm.bad"})
    ok, bad = _item("llm.ok"), _item("llm.bad")

    results = _deliver(producer, [ok, bad])

    assert results[ok.id] is None
    assert results[bad.id] == "broker down"


def test_deliver_no_items_is_a_noop() -> None:
    producer = FakeProducer()
    assert _deliver(producer, []) == {}
    assert producer.flush_calls == 0


def test_apply_delivery_results_marks_success() -> None:
    row = _row()

    published = _apply_delivery_results([row], {row.id: None})

    assert published == 1
    assert row.status == "published"
    assert row.published_at is not None
    assert row.last_error is None


def test_apply_delivery_results_marks_failure_for_retry() -> None:
    row = _row(attempts=0)

    published = _apply_delivery_results([row], {row.id: "broker down"})

    assert published == 0
    assert row.status == "retry"
    assert row.attempts == 1
    assert row.last_error == "broker down"


def test_apply_delivery_results_gives_up_after_max_attempts() -> None:
    row = _row(attempts=9)

    _apply_delivery_results([row], {row.id: "broker down"})

    assert row.status == "failed"
    assert row.attempts == 10


def test_apply_delivery_results_treats_a_missing_result_as_failure() -> None:
    """A row whose id never appears in the delivery results (e.g. it was
    claimed but _deliver never got to produce it) is treated as failed, not
    silently left alone."""
    row = _row()

    _apply_delivery_results([row], {})

    assert row.status == "retry"
    assert row.last_error == "no delivery report"
