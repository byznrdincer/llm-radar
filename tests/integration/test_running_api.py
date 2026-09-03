import os
from collections.abc import Callable
from decimal import Decimal
from typing import Any
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from llm_radar.database.models import AnalyticsEvent, Feedback, ModelDemand

BASE_URL = os.getenv("LLM_RADAR_INTEGRATION_BASE_URL")
DATABASE_URL = os.getenv("LLM_RADAR_INTEGRATION_DATABASE_URL")
pytestmark = pytest.mark.skipif(not BASE_URL, reason="running API URL was not provided")


def test_combined_model_filters_are_enforced() -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params=[
            ("openness", "open_weight"),
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
        assert item["openness"] == "open_weight"
        assert item["tool_calling"] is True
        assert item["reasoning"] is True
        assert {"text", "image", "audio", "video"} & set(item["modalities"])


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
    assert [item["importance_score"] for item in items] == sorted(
        (item["importance_score"] for item in items), reverse=True
    )


def test_event_model_filters_use_resolved_catalog_metadata() -> None:
    open_weight = httpx.get(
        f"{BASE_URL}/api/v1/events",
        params={"openness": "open_weight", "sort_by": "importance", "limit": 20},
        timeout=30,
    )
    open_weight.raise_for_status()
    open_items = open_weight.json()["items"]
    assert open_items
    assert all(item["entity_type"] == "model" for item in open_items)
    assert all(item["model_openness"] == "open_weight" for item in open_items)

    frontier = httpx.get(
        f"{BASE_URL}/api/v1/events",
        params={"model_level": "frontier", "sort_by": "importance", "limit": 20},
        timeout=30,
    )
    frontier.raise_for_status()
    frontier_items = frontier.json()["items"]
    assert frontier_items
    assert all(item["entity_type"] == "model" for item in frontier_items)
    assert all(item["model_level"] == "frontier" for item in frontier_items)


def test_event_priority_sort_puts_stronger_model_levels_first() -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/events",
        params={"sort_by": "priority", "limit": 100},
        timeout=30,
    )
    response.raise_for_status()
    items = response.json()["items"]
    assert items

    level_rank = {"frontier": 0, "advanced": 1, "mid": 2, "entry": 3}
    sort_keys = [
        (
            level_rank.get(item["model_level"], 4),
            -item["importance_score"],
        )
        for item in items
    ]
    assert sort_keys == sorted(sort_keys)


@pytest.mark.parametrize(
    "field",
    [
        "name",
        "provider",
        "input_price",
        "output_price",
        "context",
        "release_date",
        "parameter_count",
        "active_parameter_count",
        "backend",
    ],
)
def test_model_table_sorting_supports_both_directions(field: str) -> None:
    responses = {}
    for order in ("asc", "desc"):
        response = httpx.get(
            f"{BASE_URL}/api/v1/models/search",
            params={"sort_by": field, "sort_order": order, "limit": 100},
            timeout=30,
        )
        response.raise_for_status()
        responses[order] = response.json()
    assert responses["asc"]["sort_order"] == ["asc"]
    assert responses["desc"]["sort_order"] == ["desc"]
    accessors: dict[str, Callable[[dict[str, Any]], Any]] = {
        "name": lambda item: item["name"],
        "provider": lambda item: item["developer"]["name"],
        "input_price": lambda item: item["pricing"]["input"],
        "output_price": lambda item: item["pricing"]["output"],
        "context": lambda item: item["context_window"],
        "release_date": lambda item: item["release_date"],
        "parameter_count": lambda item: item["parameter_count"],
        "active_parameter_count": lambda item: item["active_parameter_count"],
        "backend": lambda item: item["providers"][0] if item["providers"] else None,
    }
    distinct_values = {
        value for item in responses["asc"]["items"] if (value := accessors[field](item)) is not None
    }
    if len(distinct_values) > 1:
        assert [item["id"] for item in responses["asc"]["items"]] != [
            item["id"] for item in responses["desc"]["items"]
        ]


def test_new_filters_can_be_combined() -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params=[
            ("openness", "open_weight"),
            ("capability", "reasoning"),
            ("capability", "tool_calling"),
            ("commercial_use_status", "allowed"),
            ("sort_by", "input_price"),
            ("sort_order", "asc"),
            ("limit", "100"),
        ],
        timeout=30,
    )
    response.raise_for_status()
    for item in response.json()["items"]:
        assert item["openness"] == "open_weight"
        assert item["reasoning"] is True or item["tool_calling"] is True
        assert item["commercial_use_status"] == "allowed"


def test_same_field_values_use_or_and_different_fields_use_and() -> None:
    response = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params=[
            ("openness", "open_weight"),
            ("openness", "proprietary"),
            ("modality", "image"),
            ("modality", "audio"),
            ("min_context", "32768"),
            ("limit", "100"),
        ],
        timeout=30,
    )
    response.raise_for_status()
    items = response.json()["items"]
    assert items
    for item in items:
        assert item["openness"] in {"open_weight", "proprietary"}
        assert {"image", "audio"} & set(item["modalities"])
        assert item["context_window"] >= 32768


def test_family_license_commercial_and_advancedness_filters_round_trip() -> None:
    facets = httpx.get(f"{BASE_URL}/api/v1/models/facets", timeout=30).json()
    family = next(item["name"] for item in facets["families"] if item["count"] > 0)
    license_category = next(item["name"] for item in facets["licenses"] if item["count"] > 0)
    commercial_status = next(
        item["name"] for item in facets["commercial_use"] if item["count"] > 0
    )

    checks = [
        ({"family": family}, lambda item: item["family"] == family),
        (
            {"license": license_category},
            lambda item: item["license_category"] == license_category,
        ),
        (
            {"commercial_use_status": commercial_status},
            lambda item: item["commercial_use_status"] == commercial_status,
        ),
        (
            {"advancedness": "unscored"},
            lambda item: item["selection"] is None,
        ),
    ]
    for params, assertion in checks:
        response = httpx.get(
            f"{BASE_URL}/api/v1/models/search",
            params={**params, "limit": 100},
            timeout=30,
        )
        response.raise_for_status()
        items = response.json()["items"]
        assert items
        assert all(assertion(item) for item in items)


def test_pagination_has_no_overlap_and_clearing_filters_restores_total() -> None:
    baseline = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={"limit": 20, "offset": 0},
        timeout=30,
    )
    baseline.raise_for_status()
    first_page = baseline.json()
    second = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={"limit": 20, "offset": 20},
        timeout=30,
    )
    second.raise_for_status()
    second_page = second.json()
    assert {item["id"] for item in first_page["items"]}.isdisjoint(
        item["id"] for item in second_page["items"]
    )

    filtered = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={"openness": "open_weight", "limit": 20},
        timeout=30,
    )
    filtered.raise_for_status()
    assert filtered.json()["total"] < first_page["total"]

    cleared = httpx.get(
        f"{BASE_URL}/api/v1/models/search",
        params={"limit": 20, "offset": 0},
        timeout=30,
    )
    cleared.raise_for_status()
    assert cleared.json()["total"] == first_page["total"]


def test_engagement_writes_are_idempotent_and_forms_validate() -> None:
    if not DATABASE_URL:
        pytest.skip("running database URL was not provided for cleanup")
    session_id = uuid4()
    event_id = uuid4()
    feedback_id = uuid4()
    demand_id = uuid4()
    try:
        event_payload = {
            "event_id": str(event_id),
            "event_type": "sort_changed",
            "session_id": str(session_id),
            "sort": {"sort_by": "output_price", "sort_order": "asc"},
        }
        first = httpx.post(f"{BASE_URL}/api/v1/analytics/events", json=event_payload, timeout=30)
        duplicate = httpx.post(
            f"{BASE_URL}/api/v1/analytics/events", json=event_payload, timeout=30
        )
        assert first.status_code == 201
        assert first.json()["accepted"] is True
        assert duplicate.status_code == 201
        assert duplicate.json()["duplicate"] is True

        feedback = httpx.post(
            f"{BASE_URL}/api/v1/feedback",
            json={
                "submission_id": str(feedback_id),
                "session_id": str(session_id),
                "feedback_type": "feature_request",
                "message": "Smoke test feedback",
                "context": {
                    "page": "/#feedback",
                    "section": "feedback",
                    "locale": "tr-TR",
                    "viewport": "1440x900",
                },
            },
            timeout=30,
        )
        assert feedback.status_code == 201
        assert feedback.json()["tracking_code"] == str(feedback_id)
        assert feedback.json()["status"] == "new"
        feedback_status = httpx.get(
            f"{BASE_URL}/api/v1/feedback/{feedback_id}/status",
            params={"session_id": str(session_id)},
            timeout=30,
        )
        assert feedback_status.status_code == 200
        assert feedback_status.json()["status"] == "new"
        empty_feedback = httpx.post(
            f"{BASE_URL}/api/v1/feedback",
            json={
                "session_id": str(session_id),
                "feedback_type": "general",
                "message": "",
            },
            timeout=30,
        )
        assert empty_feedback.status_code == 422

        demand = httpx.post(
            f"{BASE_URL}/api/v1/model-demands",
            json={
                "submission_id": str(demand_id),
                "session_id": str(session_id),
                "requested_models": ["Qwen", "DeepSeek"],
                "criteria": ["price", "openai_compatible"],
                "usage_volume": "under_10m",
                "budget_range": "100_500",
                "deployment_preference": "turkey",
                "timeline": "this_quarter",
                "context": {
                    "page": "/#feedback",
                    "section": "feedback",
                },
            },
            timeout=30,
        )
        assert demand.status_code == 201
        assert demand.json()["tracking_code"] == str(demand_id)
        assert demand.json()["status"] == "new"
        demand_status = httpx.get(
            f"{BASE_URL}/api/v1/model-demands/{demand_id}/status",
            params={"session_id": str(session_id)},
            timeout=30,
        )
        assert demand_status.status_code == 200
        assert demand_status.json()["status"] == "new"
    finally:
        engine = create_engine(DATABASE_URL)
        with Session(engine) as session, session.begin():
            session.execute(delete(AnalyticsEvent).where(AnalyticsEvent.session_id == session_id))
            session.execute(delete(Feedback).where(Feedback.session_id == session_id))
            session.execute(delete(ModelDemand).where(ModelDemand.session_id == session_id))
        engine.dispose()
