from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from llm_radar.normalize import normalize_license, normalize_modalities, to_decimal


@dataclass(frozen=True)
class NormalizedModelFeatures:
    context_window: int | None
    max_output_tokens: int | None
    input_price: Decimal | None
    output_price: Decimal | None
    cache_read_price: Decimal | None
    modalities: list[str]
    capabilities: list[str]
    supports_tool_calling: bool | None
    supports_structured_output: bool | None
    supports_reasoning: bool | None
    supports_streaming: bool | None
    availability: str | None
    license: str | None
    commercial_use_allowed: bool | None


def _optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "1", "supported"}:
            return True
        if normalized in {"false", "no", "0", "unsupported"}:
            return False
    return None


def _optional_int(value: Any) -> int | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip().lower() for item in value if str(item).strip()]


def normalize_model_features(payload: dict[str, Any]) -> NormalizedModelFeatures:
    """Map provider-specific model payloads into a stable, tri-state feature schema."""
    raw_pricing = payload.get("pricing")
    pricing: dict[str, Any] = raw_pricing if isinstance(raw_pricing, dict) else {}
    features = payload.get("capabilities")
    capabilities = _string_list(features)
    if isinstance(features, dict):
        capabilities = sorted(
            str(key).strip().lower() for key, enabled in features.items() if enabled is True
        )

    input_modalities = _string_list(payload.get("input_modalities"))
    output_modalities = _string_list(payload.get("output_modalities"))
    supported_parameters = set(_string_list(payload.get("supported_parameters")))
    modalities = normalize_modalities(input_modalities + output_modalities)

    tool_calling = _optional_bool(payload.get("supports_tool_calling", payload.get("tool_calling")))
    if tool_calling is None and supported_parameters:
        tool_calling = "tools" in supported_parameters
    structured_output = _optional_bool(
        payload.get("supports_structured_output", payload.get("structured_output"))
    )
    if structured_output is None and supported_parameters:
        structured_output = bool(supported_parameters & {"structured_outputs", "response_format"})
    reasoning = _optional_bool(payload.get("supports_reasoning", payload.get("reasoning")))
    if reasoning is None and supported_parameters:
        reasoning = bool(supported_parameters & {"reasoning", "include_reasoning"})
    streaming = _optional_bool(payload.get("supports_streaming", payload.get("streaming")))

    inferred = {
        "tool_calling": tool_calling,
        "structured_output": structured_output,
        "reasoning": reasoning,
        "streaming": streaming,
    }
    capabilities = sorted(
        set(capabilities) | {name for name, enabled in inferred.items() if enabled}
    )

    is_open_weight = _optional_bool(payload.get("is_open_weight"))
    availability = payload.get("availability")
    if availability is not None:
        availability = str(availability).strip().lower().replace("-", "_")
    elif is_open_weight is True:
        availability = "open_weight"
    elif is_open_weight is False:
        availability = "proprietary"

    input_price = to_decimal(pricing.get("input_per_1m_tokens"))
    output_price = to_decimal(pricing.get("output_per_1m_tokens"))
    cache_read_price = to_decimal(pricing.get("cache_read_per_1m_tokens"))
    license_name = normalize_license(payload.get("license"))
    commercial_use = _optional_bool(payload.get("commercial_use_allowed"))
    if commercial_use is None and license_name in {"Apache-2.0", "MIT"}:
        commercial_use = True
    elif commercial_use is None and license_name == "proprietary":
        commercial_use = False

    return NormalizedModelFeatures(
        context_window=_optional_int(payload.get("context_window")),
        max_output_tokens=_optional_int(payload.get("max_output_tokens")),
        input_price=input_price if input_price is None or input_price >= 0 else None,
        output_price=output_price if output_price is None or output_price >= 0 else None,
        cache_read_price=(
            cache_read_price if cache_read_price is None or cache_read_price >= 0 else None
        ),
        modalities=modalities,
        capabilities=capabilities,
        supports_tool_calling=tool_calling,
        supports_structured_output=structured_output,
        supports_reasoning=reasoning,
        supports_streaming=streaming,
        availability=str(availability) if availability else None,
        license=license_name,
        commercial_use_allowed=commercial_use,
    )
