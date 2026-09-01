from llm_radar.event_intelligence import classify_event, score_importance
from llm_radar.processor.service import event_title_similarity


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


def test_similar_cross_source_headlines_can_be_corroborated() -> None:
    assert (
        event_title_similarity(
            "Acme announces Series B funding for agent platform",
            "Acme agent platform raises Series B funding",
        )
        >= 0.6
    )
    assert event_title_similarity("Model pricing changed", "Critical API vulnerability") < 0.6
