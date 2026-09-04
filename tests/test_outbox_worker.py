from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from llm_radar.outbox_worker import drain_rows


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


def _row(topic: str = "llm.raw", attempts: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), topic=topic, event_key="k", payload={"a": 1},
        status="pending", attempts=attempts, published_at=None, last_error=None,
    )


def test_drain_rows_flushes_once_for_the_whole_batch() -> None:
    producer = FakeProducer()
    rows = [_row() for _ in range(5)]

    published = drain_rows(producer, rows)  # type: ignore[arg-type]

    assert published == 5
    assert producer.flush_calls == 1
    assert len(producer.produced) == 5
    assert all(row.status == "published" and row.published_at is not None for row in rows)


def test_drain_rows_marks_failed_deliveries_for_retry() -> None:
    producer = FakeProducer(fail_topics={"llm.bad"})
    ok, bad = _row("llm.ok"), _row("llm.bad")

    published = drain_rows(producer, [ok, bad])  # type: ignore[arg-type]

    assert published == 1
    assert ok.status == "published"
    assert bad.status == "retry"
    assert bad.attempts == 1
    assert bad.last_error == "broker down"


def test_drain_rows_gives_up_after_max_attempts() -> None:
    producer = FakeProducer(fail_topics={"llm.bad"})
    row = _row("llm.bad", attempts=9)

    drain_rows(producer, [row])  # type: ignore[arg-type]

    assert row.status == "failed"
    assert row.attempts == 10


def test_drain_rows_no_rows_is_a_noop() -> None:
    producer = FakeProducer()
    assert drain_rows(producer, []) == 0
    assert producer.flush_calls == 0
