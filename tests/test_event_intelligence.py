from llm_radar.collectors.news import _announcement_type
from llm_radar.event_intelligence import classify_event, score_importance
from llm_radar.events.schemas import EventType
from llm_radar.processor.parsing import event_title_similarity


def test_importance_combines_event_magnitude_source_and_verification() -> None:
    result = score_importance(
        "price.changed",
        {"change_percentage": "55"},
        reliability="official_api",
        verification_status="corroborated",
    )

    assert result.score >= 80
    assert result.level == "critical"
    assert result.factors["change_magnitude"] == 22
    assert result.factors["source_reliability"] == 20


def test_announcement_categories_cover_document_taxonomy() -> None:
    assert classify_event("company.announcement", "Series B funding announced") == "funding"
    assert classify_event("company.announcement", "Critical API security update") == "security"
    assert classify_event("product.launched", "New platform") == "product_launch"
    assert classify_event("github.release_published", "v2.0") == "product_launch"
    assert (
        classify_event(
            "company.announcement",
            "Introducing Gemini 3.8 Flash and 3.8 Flash Cyber",
        )
        == "model_release"
    )
    assert (
        _announcement_type({"title": "Introducing Gemini 3.8 Flash"})
        == EventType.COMPANY_ANNOUNCEMENT
    )
    assert (
        classify_event(
            "company.announcement",
            "Introducing agentic video understanding with Gemini",
        )
        == "product_launch"
    )
    assert (
        classify_event(
            "company.announcement",
            "The latest AI news we announced in August 2026",
            {"summary": "A roundup of model and product updates."},
        )
        == "model_update"
    )
    assert (
        classify_event(
            "company.announcement",
            "Introducing computer use in Gemini 3.5 Flash",
            {"summary": "A new feature for the Gemini model."},
        )
        == "product_launch"
    )
    assert (
        classify_event(
            "company.announcement",
            "Introducing Amazon Nova 2 Lite",
            {"summary": "Our newest efficient reasoning model is now available."},
        )
        == "model_release"
    )


def test_similar_cross_source_headlines_can_be_corroborated() -> None:
    assert (
        event_title_similarity(
            "Acme announces Series B funding for agent platform",
            "Acme agent platform raises Series B funding",
        )
        >= 0.6
    )
    assert event_title_similarity("Model pricing changed", "Critical API vulnerability") < 0.6
