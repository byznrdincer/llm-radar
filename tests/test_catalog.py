from llm_radar.catalog import EVENT_CATALOG, SOURCE_CATALOG, importance_for
from llm_radar.config import Settings, source_is_configured
from llm_radar.events.topics import ALL_TOPICS, TOPIC_BY_EVENT_TYPE
from llm_radar.normalize import company_display_name, normalize_company_name, usd_per_million
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
    assert "product.launched" in types
    assert "security.advisory" in types
    assert "api.updated" in types


def test_source_catalog_covers_official_labs() -> None:
    slugs = {item.slug for item in SOURCE_CATALOG}
    assert {"openai", "anthropic", "huggingface", "arxiv", "openrouter"} <= slugs
    assert {
        "vercel-ai-gateway",
        "aimlapi",
        "litellm",
        "nanogpt",
        "groqcloud",
        "replicate",
        "together",
        "deepinfra",
        "fireworks",
        "cloudflare-workers-ai",
        "bifrost",
    } <= slugs
    gemini_news = next(item for item in SOURCE_CATALOG if item.slug == "google-gemini-blog")
    assert gemini_news.collection_method.value == "rss"
    assert gemini_news.check_interval_seconds <= 900


def test_source_catalog_has_human_facing_links() -> None:
    assert all(
        item.public_url and item.public_url.startswith("https://") for item in SOURCE_CATALOG
    )
    assert next(item for item in SOURCE_CATALOG if item.slug == "openrouter").public_url == (
        "https://openrouter.ai/models"
    )
    assert next(item for item in SOURCE_CATALOG if item.slug == "github").public_url == (
        "https://github.com/"
    )


def test_price_drop_over_fifty_percent_is_critical() -> None:
    assert importance_for("price.changed", {"change_percentage": "-55"}).value == "critical"


def test_leader_change_is_critical() -> None:
    assert importance_for("leaderboard.changed", {"rank": 1}).value == "critical"


def test_topics_include_dead_letter_and_domain_streams() -> None:
    assert "llm.dead_letter" in ALL_TOPICS
    assert TOPIC_BY_EVENT_TYPE["research.published"] == "llm.research_papers"


def test_normalize_company_and_price_units() -> None:
    assert normalize_company_name("Open AI") == "openai"
    assert normalize_company_name("~OpenAI") == "openai"
    assert normalize_company_name("~Anthropic") == "anthropic"
    assert normalize_company_name("deepseek-ai") == "deepseek"
    assert normalize_company_name("meta-llama") == "meta"
    assert normalize_company_name("mistralai") == "mistral"
    assert company_display_name("openai") == "OpenAI"
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


def test_optional_sources_require_credentials_only_without_public_catalogs() -> None:
    settings = Settings(
        _env_file=None,
        artificial_analysis_api_key=None,
        groq_api_key=None,
        replicate_api_token=None,
        together_api_key=None,
        fireworks_api_key=None,
        cloudflare_account_id=None,
        cloudflare_api_token=None,
    )
    assert source_is_configured("vercel-ai-gateway", settings) is True
    assert source_is_configured("groqcloud", settings) is False
    assert source_is_configured("replicate", settings) is False
    assert source_is_configured("together", settings) is False
    assert source_is_configured("deepinfra", settings) is True
    assert source_is_configured("bifrost", settings) is True
    assert source_is_configured("fireworks", settings) is True
    assert source_is_configured("cloudflare-workers-ai", settings) is True
