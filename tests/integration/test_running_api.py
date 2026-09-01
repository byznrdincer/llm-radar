import os
from collections.abc import Callable
from decimal import Decimal
from typing import Any

import httpx
import pytest

BASE_URL = os.getenv("LLM_RADAR_INTEGRATION_BASE_URL")
pytestmark = pytest.mark.skipif(not BASE_URL, reason="running API URL was not provided")


def test_combined_model_filters_are_enforced() -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params=[
            ("availability", "open_weight"),
            ("tool_calling", "true"),
            ("reasoning", "true"),
            ("modality", "text"),
            ("modality", "image"),
            ("modality", "audio"),
            ("modality", "video"),
        ],
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    assert payload["total"] >= 1
    for item in payload["items"]:
        assert item["availability"] == "open_weight"
        assert item["tool_calling"] is True
        assert item["reasoning"] is True
        assert {"text", "image", "audio", "video"} <= set(item["modalities"])


@pytest.mark.parametrize(
    ("params", "assertion"),
    [
        ({"min_context": "131072"}, lambda item: item["context_window"] >= 131072),
        (
            {"max_input_price": "2"},
            lambda item: Decimal(item["pricing"]["input"]) <= Decimal("2"),
        ),
        (
            {"max_output_price": "8"},
            lambda item: Decimal(item["pricing"]["output"]) <= Decimal("8"),
        ),
        ({"tool_calling": "true"}, lambda item: item["tool_calling"] is True),
        ({"tool_calling": "false"}, lambda item: item["tool_calling"] is False),
        ({"reasoning": "true"}, lambda item: item["reasoning"] is True),
        ({"reasoning": "false"}, lambda item: item["reasoning"] is False),
        (
            {"availability": "open_weight"},
            lambda item: item["availability"] == "open_weight",
        ),
        (
            {"availability": "proprietary"},
            lambda item: item["availability"] == "proprietary",
        ),
        ({"availability": "unknown"}, lambda item: item["availability"] is None),
        ({"modality": "text"}, lambda item: "text" in item["modalities"]),
        ({"modality": "image"}, lambda item: "image" in item["modalities"]),
        ({"modality": "audio"}, lambda item: "audio" in item["modalities"]),
        ({"modality": "video"}, lambda item: "video" in item["modalities"]),
    ],
)
def test_each_advanced_filter_is_enforced(
    params: dict[str, str], assertion: Callable[[dict[str, Any]], bool]
) -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={**params, "limit": "40"},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    assert payload["total"] >= 1
    assert all(assertion(item) for item in payload["items"])


def test_developer_and_provider_filters_are_distinct_and_enforced() -> None:
    facets = httpx.get(f"{BASE_URL}/api/v1/models/facets", timeout=30).json()
    developer = facets["developers"][0]["slug"]
    provider = facets["providers"][0]["slug"]

    developer_response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={"developer": developer, "limit": 40},
        timeout=30,
    )
    developer_response.raise_for_status()
    developer_items = developer_response.json()["items"]
    assert developer_items
    assert all(item["developer"]["slug"] == developer for item in developer_items)

    provider_response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={"provider": provider, "limit": 40},
        timeout=30,
    )
    provider_response.raise_for_status()
    provider_items = provider_response.json()["items"]
    assert provider_items
    assert all(provider in item["providers"] for item in provider_items)


@pytest.mark.parametrize("focus", ["general", "coding", "reasoning", "agent", "multimodal"])
def test_benchmark_focus_returns_explainable_ranked_results(focus: str) -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={"benchmark_focus": focus, "sort_by": "best_match", "limit": 20},
        timeout=30,
    )
    response.raise_for_status()
    items = response.json()["items"]
    assert items
    assert all(item["selection"] is not None for item in items)
    scores = [item["selection"]["benchmark_score"] for item in items]
    assert scores == sorted(scores, reverse=True)


def test_multimodal_selection_has_explainable_results() -> None:
    response = httpx.post(
        f"{BASE_URL}/api/v1/models/select",
        json={"use_case": "multimodal", "limit": 5},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    assert payload["total"] >= 1
    assert payload["items"][0]["selection"]["basis"] in {"benchmark", "profile"}
    assert payload["items"][0]["recommendation_rank"] == 1


def test_event_feed_exposes_scores_and_categories() -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/events",
        params={"sort_by": "importance", "limit": 20},
        timeout=30,
    )
    response.raise_for_status()
    items = response.json()["items"]
    assert items
    assert all(0 <= item["importance_score"] <= 100 for item in items)
    assert all(item["category"] for item in items)
