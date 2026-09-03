from typing import Any, cast
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from llm_radar.api.engagement import (
    AnalyticsEventRequest,
    FeedbackRequest,
    ModelDemandRequest,
    record_analytics_event,
)
from llm_radar.api.routes import _license_category
from llm_radar.database.models import AnalyticsEvent


class FakeSession:
    def __init__(self) -> None:
        self.events: dict[Any, AnalyticsEvent] = {}
        self.commits = 0

    def get(self, model_type: type[Any], identifier: Any) -> Any:
        if model_type is AnalyticsEvent:
            return self.events.get(identifier)
        return None

    def add(self, value: Any) -> None:
        if isinstance(value, AnalyticsEvent):
            self.events[value.id] = value

    def commit(self) -> None:
        self.commits += 1


def test_analytics_event_id_prevents_duplicate_storage() -> None:
    fake = FakeSession()
    session = cast(Session, fake)
    event_id = uuid4()
    request = AnalyticsEventRequest(
        event_id=event_id,
        event_type="sort_changed",
        session_id=uuid4(),
        sort={"sort_by": "output_price", "sort_order": "asc"},
    )

    first = record_analytics_event(request, session)
    second = record_analytics_event(request, session)

    assert first["accepted"] is True
    assert second["duplicate"] is True
    assert fake.commits == 1


def test_unknown_analytics_event_is_rejected() -> None:
    with pytest.raises(ValidationError):
        AnalyticsEventRequest(
            event_type="page_scrolled",
            session_id=uuid4(),
        )


def test_model_demand_normalizes_duplicates_and_whitespace() -> None:
    request = ModelDemandRequest(
        session_id=uuid4(),
        requested_models=[" Qwen ", "Qwen", "DeepSeek"],
        other_model="  Yerli Model  ",
        criteria=["price", "openai_compatible", "fine_tuning"],
        usage_volume="under_10m",
        budget_range="100_500",
        deployment_preference="turkey",
        timeline="this_quarter",
        context={
            "page": " / ",
            "section": " feedback ",
            "locale": " tr-TR ",
        },
    )

    assert request.requested_models == ["Qwen", "DeepSeek"]
    assert request.other_model == "Yerli Model"
    assert request.criteria == ["price", "openai_compatible", "fine_tuning"]
    assert request.usage_volume == "under_10m"
    assert request.deployment_preference == "turkey"
    assert request.context is not None
    assert request.context.page == "/"
    assert request.context.section == "feedback"


def test_model_demand_normalizes_profile_fields() -> None:
    request = ModelDemandRequest(
        session_id=uuid4(),
        requested_models=["Qwen"],
        user_type=["developer", "developer", "startup"],
        full_name="  Ada Lovelace  ",
        organization_name="   ",
        user_note="  Türkçe destek önemli.  ",
    )

    assert request.user_type == ["developer", "startup"]
    assert request.full_name == "Ada Lovelace"
    assert request.organization_name is None
    assert request.user_note == "Türkçe destek önemli."


def test_model_demand_rejects_unknown_user_type() -> None:
    with pytest.raises(ValidationError):
        ModelDemandRequest(
            session_id=uuid4(),
            requested_models=["Qwen"],
            user_type=["freelancer"],
        )


def test_feedback_context_rejects_oversized_values() -> None:
    with pytest.raises(ValidationError):
        FeedbackRequest(
            feedback_type="general",
            message="Useful feedback",
            context={"page": "/" + "x" * 300},
        )


def test_model_demand_rejects_unknown_operational_options() -> None:
    with pytest.raises(ValidationError):
        ModelDemandRequest(
            session_id=uuid4(),
            requested_models=["Qwen"],
            usage_volume="unlimited",
        )


@pytest.mark.parametrize(
    ("license_name", "category"),
    [
        ("MIT", "mit"),
        ("Apache-2.0", "apache_2_0"),
        ("Llama 3 Community License", "llama_community"),
        ("Model-specific", "model_specific"),
        ("Proprietary", "other"),
        (None, "unknown"),
    ],
)
def test_license_categories(license_name: str | None, category: str) -> None:
    assert _license_category(license_name) == category
