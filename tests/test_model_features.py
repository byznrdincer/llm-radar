from decimal import Decimal

from llm_radar.model_features import normalize_model_features


def test_normalizes_model_features_without_turning_unknown_into_false() -> None:
    profile = normalize_model_features(
        {
            "context_window": "131072",
            "max_output_tokens": 8192,
            "input_modalities": ["text", "vision"],
            "output_modalities": ["text"],
            "supports_tool_calling": "yes",
            "reasoning": None,
            "is_open_weight": True,
            "license": "apache 2",
            "pricing": {
                "input_per_1m_tokens": "0.50",
                "output_per_1m_tokens": "1.50",
            },
        }
    )

    assert profile.context_window == 131072
    assert profile.input_price == Decimal("0.50")
    assert profile.modalities == ["text", "image"]
    assert profile.supports_tool_calling is True
    assert profile.supports_reasoning is None
    assert profile.availability == "open_weight"
    assert profile.openness == "open_weight"
    assert profile.license == "Apache-2.0"
    assert profile.commercial_use_allowed is True
    assert profile.commercial_use_status == "allowed"
    assert "tool_calling" in profile.capabilities


def test_normalizes_explicit_false_and_capability_mapping() -> None:
    profile = normalize_model_features(
        {
            "capabilities": {"coding": True, "vision": False},
            "tool_calling": False,
            "structured_output": "supported",
            "availability": "closed-source",
        }
    )

    assert profile.supports_tool_calling is False
    assert profile.supports_structured_output is True
    assert profile.availability == "closed_source"
    assert profile.openness == "proprietary"
    assert profile.capabilities == ["coding", "structured_output"]


def test_keeps_open_source_distinct_from_open_weight() -> None:
    profile = normalize_model_features(
        {
            "availability": "open-source",
            "is_open_source": True,
            "license": "MIT",
            "commercial_use_status": "allowed",
        }
    )

    assert profile.availability == "open_source"
    assert profile.openness == "open_source"
    assert profile.commercial_use_status == "allowed"


def test_invalid_numeric_values_are_unknown() -> None:
    profile = normalize_model_features(
        {
            "context_window": "unknown",
            "pricing": {"input_per_1m_tokens": "n/a"},
        }
    )

    assert profile.context_window is None
    assert profile.input_price is None


def test_proprietary_label_does_not_guess_commercial_terms() -> None:
    profile = normalize_model_features({"availability": "proprietary", "license": "proprietary"})

    assert profile.openness == "proprietary"
    assert profile.commercial_use_allowed is None
    assert profile.commercial_use_status is None


def test_negative_sentinel_prices_are_unknown() -> None:
    profile = normalize_model_features(
        {"pricing": {"input_per_1m_tokens": "-1000000", "output_per_1m_tokens": "1"}}
    )

    assert profile.input_price is None
    assert profile.output_price == Decimal("1")
