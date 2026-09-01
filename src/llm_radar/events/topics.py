RAW_UPDATES = "llm.raw_updates"
MODEL_RELEASES = "llm.model_releases"
MODEL_UPDATES = "llm.model_updates"
PRICE_CHANGES = "llm.price_changes"
BENCHMARK_UPDATES = "llm.benchmark_updates"
LEADERBOARD_CHANGES = "llm.leaderboard_changes"
COMPANY_NEWS = "llm.company_news"
RESEARCH_PAPERS = "llm.research_papers"
OPEN_WEIGHT_RELEASES = "llm.open_weight_releases"
LICENSE_CHANGES = "llm.license_changes"
HUGGINGFACE_UPDATES = "llm.huggingface_updates"
GITHUB_UPDATES = "llm.github_updates"
PROCESSED_EVENTS = "llm.processed_events"
ALERTS = "llm.alerts"
DEAD_LETTER = "llm.dead_letter"

# Backward-compatible aliases used by existing consumers.
MODEL_EVENTS = MODEL_UPDATES
PRICE_EVENTS = PRICE_CHANGES
BENCHMARK_EVENTS = BENCHMARK_UPDATES
RESEARCH_EVENTS = RESEARCH_PAPERS

ALL_TOPICS = (
    RAW_UPDATES,
    MODEL_RELEASES,
    MODEL_UPDATES,
    PRICE_CHANGES,
    BENCHMARK_UPDATES,
    LEADERBOARD_CHANGES,
    COMPANY_NEWS,
    RESEARCH_PAPERS,
    OPEN_WEIGHT_RELEASES,
    LICENSE_CHANGES,
    HUGGINGFACE_UPDATES,
    GITHUB_UPDATES,
    PROCESSED_EVENTS,
    ALERTS,
    DEAD_LETTER,
)

TOPIC_BY_EVENT_TYPE = {
    "model.released": MODEL_RELEASES,
    "model.updated": MODEL_UPDATES,
    "model.deprecated": MODEL_UPDATES,
    "model.version_changed": MODEL_UPDATES,
    "price.changed": PRICE_CHANGES,
    "cache_price.changed": PRICE_CHANGES,
    "context.changed": MODEL_UPDATES,
    "capability.changed": MODEL_UPDATES,
    "license.changed": LICENSE_CHANGES,
    "weights.released": OPEN_WEIGHT_RELEASES,
    "huggingface.updated": HUGGINGFACE_UPDATES,
    "github.release_published": GITHUB_UPDATES,
    "benchmark.updated": BENCHMARK_UPDATES,
    "leaderboard.changed": LEADERBOARD_CHANGES,
    "company.announcement": COMPANY_NEWS,
    "research.published": RESEARCH_PAPERS,
    "technology.detected": MODEL_UPDATES,
    "market_share.changed": PRICE_CHANGES,
    "agent.updated": COMPANY_NEWS,
    "product.launched": COMPANY_NEWS,
    "funding.announced": COMPANY_NEWS,
    "acquisition.announced": COMPANY_NEWS,
    "partnership.announced": COMPANY_NEWS,
    "infrastructure.updated": COMPANY_NEWS,
    "regulation.updated": COMPANY_NEWS,
    "security.advisory": COMPANY_NEWS,
    "api.updated": COMPANY_NEWS,
}
