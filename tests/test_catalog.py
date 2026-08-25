from llm_radar.catalog import EVENT_CATALOG, SOURCE_CATALOG, importance_for
from llm_radar.events.topics import ALL_TOPICS, TOPIC_BY_EVENT_TYPE
from llm_radar.normalize import normalize_company_name, usd_per_million
from llm_radar.pipeline import canonical_hash
from llm_radar.ranking import value_score
from llm_radar.resolution import resolve_entity_key


def test_event_catalog_covers_required_types() -> None:
    types = {item.event_type for item in EVENT_CATALOG}
    assert "model.released" in types
    assert "huggingface.updated" in types
    assert "github.release_published" in types
    assert "technology.detected" in types
    assert "market_share.changed" in types


def test_source_catalog_covers_official_labs() -> None:
    slugs = {item.slug for item in SOURCE_CATALOG}
    assert {"openai", "anthropic", "huggingface", "arxiv", "openrouter"} <= slugs


def test_price_drop_over_fifty_percent_is_critical() -> None:
    assert importance_for("price.changed", {"change_percentage": "-55"}).value == "critical"


def test_leader_change_is_critical() -> None:
    assert importance_for("leaderboard.changed", {"rank": 1}).value == "critical"


def test_topics_include_dead_letter_and_domain_streams() -> None:
    assert "llm.dead_letter" in ALL_TOPICS
    assert TOPIC_BY_EVENT_TYPE["research.published"] == "llm.research_papers"


def test_normalize_company_and_price_units() -> None:
    assert normalize_company_name("Open AI") == "openai"
    assert usd_per_million("0.000002") == 2


def test_content_hash_is_stable() -> None:
    assert canonical_hash({"b": 1, "a": 2}) == canonical_hash({"a": 2, "b": 1})


def test_entity_resolution_uses_provider_id() -> None:
    result = resolve_entity_key(None, "openai/gpt-4.1")
    assert result.canonical_key == "openai/gpt-4.1"
    assert result.method == "provider_id"


def test_value_score_omits_missing_metrics() -> None:
    result = value_score(quality=80, input_price=10, output_price=None, scenario="chat")
    assert result["score"] is not None
    assert result["coverage"] < 100
    assert all(item["metric"] != "output_price" for item in result["breakdown"])
