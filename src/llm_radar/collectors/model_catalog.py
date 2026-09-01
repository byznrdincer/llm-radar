from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from llm_radar.events.schemas import (
    EventEnvelope,
    EventMetadata,
    EventType,
    ReliabilityLevel,
)
from llm_radar.normalize import normalize_company_name

ONE_MILLION = Decimal("1000000")


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def price_per_million(value: Any, *, unit: str = "per_token") -> str | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if amount < 0:
        return None
    if unit in {"per_million", "per_million_tokens", "per_1m_tokens"}:
        return str(amount)
    return str(amount * ONE_MILLION)


def canonical_model_key(model_id: Any, owner: Any = None) -> str | None:
    raw_id = str(model_id or "").strip().strip("/")
    if not raw_id:
        return None
    if "/" in raw_id:
        raw_owner, model_name = raw_id.split("/", 1)
        owner_slug = normalize_company_name(raw_owner)
        return f"{owner_slug}/{model_name.lower()}"
    owner_slug = normalize_company_name(str(owner or ""))
    if not owner_slug:
        return None
    return f"{owner_slug}/{raw_id.lower()}"


def optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "1", "supported"}:
            return True
        if normalized in {"false", "no", "0", "unsupported"}:
            return False
    return None


def string_list(value: Any) -> list[str] | None:
    if not isinstance(value, (list, tuple, set)):
        return None
    result = [str(item).strip().lower() for item in value if str(item).strip()]
    return list(dict.fromkeys(result))


def enabled_capabilities(value: Any) -> list[str] | None:
    if isinstance(value, dict):
        result = [str(key).strip().lower() for key, enabled in value.items() if enabled is True]
        return sorted(result)
    return string_list(value)


def model_event(
    *,
    source: str,
    source_url: str,
    reliability: ReliabilityLevel,
    entity_key: str,
    payload: dict[str, Any],
    collected_at: datetime,
) -> EventEnvelope:
    clean_payload = {key: value for key, value in payload.items() if value is not None}
    pricing = clean_payload.get("pricing")
    if isinstance(pricing, dict):
        clean_pricing = {key: value for key, value in pricing.items() if value is not None}
        if clean_pricing:
            clean_payload["pricing"] = clean_pricing
        else:
            clean_payload.pop("pricing")
    return EventEnvelope(
        event_type=EventType.MODEL_UPDATED,
        source=source,
        entity_key=entity_key,
        occurred_at=collected_at,
        collected_at=collected_at,
        payload=clean_payload,
        metadata=EventMetadata(
            source_url=source_url,
            reliability=reliability,
            extraction_method="api",
        ),
    )


def collected_now() -> datetime:
    return datetime.now(UTC)
