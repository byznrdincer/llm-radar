from datetime import date

import pytest

from llm_radar.processor.parsing import _positive_int, _release_date


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("7B", 7_000_000_000), ("3.2b", 3_200_000_000), (8_000, 8_000), (None, None)],
)
def test_positive_int_parses_source_parameter_counts(raw: object, expected: int | None) -> None:
    assert _positive_int(raw) == expected


def test_release_date_accepts_iso_timestamp_and_rejects_unknown() -> None:
    assert _release_date("2026-08-17T10:30:00Z") == date(2026, 8, 17)
    assert _release_date("unknown") is None
