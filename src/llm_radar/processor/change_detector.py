from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from llm_radar.catalog import importance_for
from llm_radar.events.schemas import EventType


@dataclass(frozen=True, slots=True)
class DetectedChange:
    event_type: EventType
    field: str
    old_value: Any
    new_value: Any
    percentage: Decimal | None = None
    importance: str = "medium"


def _percentage(old: Any, new: Any) -> Decimal | None:
    try:
        old_decimal = Decimal(str(old))
        new_decimal = Decimal(str(new))
    except Exception:
        return None
    if old_decimal == 0:
        return None
    return ((new_decimal - old_decimal) / old_decimal * 100).quantize(Decimal("0.0001"))


def _append(
    changes: list[DetectedChange],
    event_type: EventType,
    field: str,
    old: Any,
    new: Any,
) -> None:
    if old == new:
        return
    percentage = _percentage(old, new)
    payload = {
        "change_percentage": str(percentage) if percentage is not None else None,
        "new_value": {field: new},
    }
    changes.append(
        DetectedChange(
            event_type,
            field,
            old,
            new,
            percentage,
            importance_for(event_type.value, payload).value,
        )
    )


def detect_changes(old: dict[str, Any], new: dict[str, Any]) -> list[DetectedChange]:
    changes: list[DetectedChange] = []
    scalar_events = {
        "context_window": EventType.CONTEXT_CHANGED,
        "version": EventType.MODEL_VERSION_CHANGED,
        "license": EventType.LICENSE_CHANGED,
        "is_open_weight": EventType.WEIGHTS_RELEASED,
        "status": EventType.MODEL_DEPRECATED,
    }
    for field, event_type in scalar_events.items():
        if field in old and field in new:
            old_value, new_value = old.get(field), new.get(field)
            if field == "is_open_weight" and not (old_value is False and new_value is True):
                if old_value != new_value:
                    _append(changes, EventType.MODEL_UPDATED, field, old_value, new_value)
                continue
            if field == "status" and new_value not in {"deprecated", "retired", "disabled"}:
                if old_value != new_value:
                    _append(changes, EventType.MODEL_UPDATED, field, old_value, new_value)
                continue
            _append(changes, event_type, field, old_value, new_value)

    for field in (
        "input_modalities",
        "output_modalities",
        "reasoning",
        "tool_calling",
        "mcp",
        "computer_use",
    ):
        if field in old and field in new:
            _append(changes, EventType.CAPABILITY_CHANGED, field, old.get(field), new.get(field))

    old_pricing = old.get("pricing") or {}
    new_pricing = new.get("pricing") or {}
    for field in ("input_per_1m_tokens", "output_per_1m_tokens"):
        if field in old_pricing or field in new_pricing:
            _append(
                changes,
                EventType.PRICE_CHANGED,
                field,
                old_pricing.get(field),
                new_pricing.get(field),
            )
    for field in ("cache_read_per_1m_tokens", "cache_write_per_1m_tokens"):
        if field in old_pricing or field in new_pricing:
            _append(
                changes,
                EventType.CACHE_PRICE_CHANGED,
                field,
                old_pricing.get(field),
                new_pricing.get(field),
            )
    return changes
