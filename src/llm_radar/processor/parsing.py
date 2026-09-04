"""Pure parsers and text helpers used by the event processor.

Split out of ``processor.service`` so the value coercion (source-supplied
numbers, dates, parameter counts) and the cross-source headline similarity can
be tested and reused without pulling in the whole processing pipeline.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from typing import Any

from llm_radar.normalize import normalize_company_name

_TITLE_STOPWORDS = {
    "about",
    "announces",
    "from",
    "into",
    "launches",
    "new",
    "the",
    "with",
    "icin",
    "için",
    "ve",
    "yeni",
}


def _decimal(value: Any) -> Decimal | None:
    return Decimal(str(value)) if value not in (None, "") else None


def _price_decimal(value: Any) -> Decimal | None:
    amount = _decimal(value)
    return amount if amount is None or amount >= 0 else None


def _positive_int(value: Any) -> int | None:
    """Parse source-supplied parameter counts without guessing from model names."""
    if value in (None, "") or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float):
        parsed = int(value)
        return parsed if parsed > 0 else None
    normalized = str(value).strip().lower().replace(",", "").replace("_", "")
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([kmbt])?", normalized)
    if match is None:
        return None
    multipliers = {None: 1, "k": 1_000, "m": 1_000_000, "b": 1_000_000_000, "t": 1_000_000_000_000}
    parsed = int(Decimal(match.group(1)) * multipliers[match.group(2)])
    return parsed if parsed > 0 else None


def _release_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def _company_slug(entity_key: str) -> str:
    return normalize_company_name(entity_key.split("/", 1)[0])


def event_title_similarity(left: str, right: str) -> float:
    """Return a conservative token Jaccard score for cross-source headlines."""

    def tokenize(value: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[a-z0-9çğıöşü]+", value.lower())
            if len(token) >= 3 and token not in _TITLE_STOPWORDS
        }

    left_tokens = tokenize(left)
    right_tokens = tokenize(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
