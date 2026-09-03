"""Canonical event, source, unit, and importance catalogs."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Any


class Importance(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SourceCategory(StrEnum):
    COMPANY = "company"
    MODEL_CODE = "model_code"
    RESEARCH = "research"
    BENCHMARK = "benchmark"
    MARKET = "market"


class SourceClass(StrEnum):
    OFFICIAL = "official"
    INDEPENDENT = "independent"
    COMMUNITY = "community"


class CollectionMethod(StrEnum):
    REST = "rest"
    RSS = "rss"
    HTML = "html"
    PLAYWRIGHT = "playwright"
    GITHUB = "github"
    HUGGINGFACE = "huggingface"
    ARXIV = "arxiv"
    BENCHMARK = "benchmark"


@dataclass(frozen=True)
class EventSpec:
    event_type: str
    label: str
    description: str
    default_importance: Importance
    entity_type: str


@dataclass(frozen=True)
class SourceSpec:
    slug: str
    name: str
    url: str
    category: SourceCategory
    source_class: SourceClass
    collection_method: CollectionMethod
    check_interval_seconds: int
    rate_limit_per_minute: int | None
    auth_type: str
    reliability: str
    terms_url: str | None = None
    is_active: bool = True
    public_url: str | None = None


EVENT_CATALOG: tuple[EventSpec, ...] = (
    EventSpec(
        "model.released", "Yeni model", "Yeni bir model yayımlandı", Importance.HIGH, "model"
    ),
    EventSpec(
        "model.updated",
        "Model güncellemesi",
        "Model kartı veya metadata güncellendi",
        Importance.MEDIUM,
        "model",
    ),
    EventSpec(
        "model.deprecated",
        "Kullanımdan kaldırma",
        "Model API erişimi sonlandırıldı veya deprecated oldu",
        Importance.HIGH,
        "model",
    ),
    EventSpec(
        "model.version_changed",
        "Sürüm değişimi",
        "Model sürümü değişti",
        Importance.MEDIUM,
        "model",
    ),
    EventSpec(
        "price.changed",
        "Fiyat değişimi",
        "Girdi veya çıktı token fiyatı değişti",
        Importance.MEDIUM,
        "price",
    ),
    EventSpec(
        "cache_price.changed",
        "Önbellek fiyatı",
        "Cache read/write fiyatı değişti",
        Importance.LOW,
        "price",
    ),
    EventSpec(
        "context.changed",
        "Context değişimi",
        "Context penceresi değişti",
        Importance.MEDIUM,
        "model",
    ),
    EventSpec(
        "capability.changed",
        "Yetenek değişimi",
        "Modalite, tool calling veya benzeri yetenek değişti",
        Importance.MEDIUM,
        "model",
    ),
    EventSpec(
        "license.changed", "Lisans değişimi", "Model lisansı değişti", Importance.HIGH, "model"
    ),
    EventSpec(
        "weights.released", "Açık ağırlık", "Yeni açık ağırlık yayımlandı", Importance.HIGH, "model"
    ),
    EventSpec(
        "huggingface.updated",
        "Hugging Face güncellemesi",
        "Hugging Face model kartı veya indirme verisi değişti",
        Importance.INFO,
        "model",
    ),
    EventSpec(
        "github.release_published",
        "GitHub sürümü",
        "İzlenen bir depoda yeni sürüm çıktı",
        Importance.MEDIUM,
        "repository",
    ),
    EventSpec(
        "benchmark.updated",
        "Benchmark güncellemesi",
        "Benchmark protokolü veya sonucu güncellendi",
        Importance.MEDIUM,
        "benchmark",
    ),
    EventSpec(
        "leaderboard.changed",
        "Sıralama değişimi",
        "Leaderboard sırası değişti",
        Importance.MEDIUM,
        "leaderboard_entry",
    ),
    EventSpec(
        "company.announcement",
        "Şirket duyurusu",
        "Resmî şirket haberi veya duyurusu",
        Importance.MEDIUM,
        "company",
    ),
    EventSpec(
        "research.published",
        "Araştırma",
        "Yeni arXiv veya laboratuvar yayını",
        Importance.LOW,
        "paper",
    ),
    EventSpec(
        "technology.detected",
        "Teknoloji sinyali",
        "Yeni agent, multimodal veya computer-use sinyali",
        Importance.MEDIUM,
        "technology",
    ),
    EventSpec(
        "market_share.changed",
        "Pazar payı",
        "Kullanım veya pazar payı değişti",
        Importance.LOW,
        "market",
    ),
    EventSpec("agent.updated", "AI Agent", "Agent gelişmesi", Importance.HIGH, "technology"),
    EventSpec(
        "product.launched", "Ürün lansmanı", "Yeni ürün veya servis", Importance.HIGH, "product"
    ),
    EventSpec("funding.announced", "Yatırım", "Yeni yatırım turu", Importance.MEDIUM, "company"),
    EventSpec(
        "acquisition.announced", "Satın alma", "Şirket satın alması", Importance.HIGH, "company"
    ),
    EventSpec(
        "partnership.announced", "İş ortaklığı", "Yeni iş ortaklığı", Importance.MEDIUM, "company"
    ),
    EventSpec(
        "infrastructure.updated", "Altyapı", "AI altyapı gelişmesi", Importance.MEDIUM, "technology"
    ),
    EventSpec(
        "regulation.updated", "Regülasyon", "AI düzenleme gelişmesi", Importance.HIGH, "regulation"
    ),
    EventSpec("security.advisory", "Güvenlik", "Güvenlik gelişmesi", Importance.HIGH, "security"),
    EventSpec(
        "api.updated", "API güncellemesi", "API veya SDK değişikliği", Importance.MEDIUM, "api"
    ),
)

EVENT_BY_TYPE = {item.event_type: item for item in EVENT_CATALOG}

UNITS = {
    "price": "USD / 1M tokens",
    "latency": "milliseconds",
    "throughput": "tokens/second",
    "context": "tokens",
    "timestamp": "UTC",
    "size": "bytes",
}

WATCHED_GITHUB_REPOS = (
    "openai/openai-python",
    "anthropics/anthropic-sdk-python",
    "ggerganov/llama.cpp",
    "huggingface/transformers",
    "vllm-project/vllm",
    "sgl-project/sglang",
    "modelcontextprotocol/python-sdk",
    "browser-use/browser-use",
)

WATCHED_HF_ORGS = (
    "meta-llama",
    "mistralai",
    "Qwen",
    "deepseek-ai",
    "google",
    "openai",
    "moonshotai",
    "MiniMaxAI",
    "nvidia",
    "tubitak",
    "TURKCELL",
    "vngrs-ai",
    "YildizTechnicalUniversity",
    "ODMDATA",
    "KartalBT",
)

TURKISH_HF_SEARCH_QUERIES = (
    "turkish llm",
    "turkce",
    "türkçe",
    "turkish language",
)

# High-value repositories whose weight evidence must remain attached even when
# they are no longer among an organization's most recently updated models.
PINNED_HF_MODELS = (
    "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-BF16",
    "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-FP8",
    "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-NVFP4",
    "TURKCELL/Turkcell-LLM-7b-v1",
)

SOURCE_CATALOG: tuple[SourceSpec, ...] = (
    SourceSpec(
        "openai",
        "OpenAI",
        "https://openai.com/news/rss.xml",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.RSS,
        900,
        10,
        "none",
        "official_document",
        "https://openai.com/policies/terms-of-use",
        public_url="https://openai.com/news/",
    ),
    SourceSpec(
        "openai-pricing",
        "OpenAI Pricing",
        "https://developers.openai.com/api/docs/pricing.md",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        900,
        6,
        "none",
        "official_document",
        "https://openai.com/policies/terms-of-use",
        public_url="https://developers.openai.com/api/docs/pricing",
    ),
    SourceSpec(
        "anthropic",
        "Anthropic",
        "https://www.anthropic.com/news",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        6,
        "none",
        "official_document",
        "https://www.anthropic.com/legal/consumer-terms",
        public_url="https://www.anthropic.com/news",
    ),
    SourceSpec(
        "google-deepmind",
        "Google DeepMind",
        "https://deepmind.google/discover/blog/",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        6,
        "none",
        "official_document",
        public_url="https://deepmind.google/discover/blog/",
    ),
    SourceSpec(
        "google-gemini-blog",
        "Google Gemini Blog",
        "https://blog.google/innovation-and-ai/models-and-research/gemini-models/rss/",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.RSS,
        900,
        8,
        "none",
        "official_document",
        public_url="https://blog.google/innovation-and-ai/models-and-research/gemini-models/",
    ),
    SourceSpec(
        "xai",
        "xAI",
        "https://x.ai/news",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        4,
        "none",
        "official_document",
        public_url="https://x.ai/news",
    ),
    SourceSpec(
        "meta-ai",
        "Meta AI",
        "https://ai.meta.com/blog/",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        6,
        "none",
        "official_document",
        public_url="https://ai.meta.com/blog/",
    ),
    SourceSpec(
        "deepseek",
        "DeepSeek",
        "https://github.com/deepseek-ai",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.GITHUB,
        1_800,
        10,
        "none",
        "official_document",
        public_url="https://github.com/deepseek-ai",
    ),
    SourceSpec(
        "qwen",
        "Qwen",
        "https://qwenlm.github.io/",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        6,
        "none",
        "official_document",
        public_url="https://qwenlm.github.io/",
    ),
    SourceSpec(
        "moonshot",
        "Moonshot AI",
        "https://www.kimi.com/news",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        4,
        "none",
        "official_document",
        public_url="https://www.kimi.com/news",
    ),
    SourceSpec(
        "mistral",
        "Mistral AI",
        "https://mistral.ai/news",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        6,
        "none",
        "official_document",
        public_url="https://mistral.ai/news",
    ),
    SourceSpec(
        "zai",
        "Z.ai",
        "https://z.ai/",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        4,
        "none",
        "official_document",
        public_url="https://z.ai/",
    ),
    SourceSpec(
        "minimax",
        "MiniMax",
        "https://www.minimax.io/",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.HTML,
        1_800,
        4,
        "none",
        "official_document",
        public_url="https://www.minimax.io/",
    ),
    SourceSpec(
        "nvidia",
        "NVIDIA",
        "https://blogs.nvidia.com/blog/category/generative-ai/feed/",
        SourceCategory.COMPANY,
        SourceClass.OFFICIAL,
        CollectionMethod.RSS,
        1_800,
        10,
        "none",
        "official_document",
        public_url="https://blogs.nvidia.com/blog/category/generative-ai/",
    ),
    SourceSpec(
        "huggingface",
        "Hugging Face",
        "https://huggingface.co/api/models",
        SourceCategory.MODEL_CODE,
        SourceClass.OFFICIAL,
        CollectionMethod.HUGGINGFACE,
        21_600,
        30,
        "optional_token",
        "official_api",
        "https://huggingface.co/terms-of-service",
        public_url="https://huggingface.co/models",
    ),
    SourceSpec(
        "ollama",
        "Ollama Library",
        "https://ollama.com/library",
        SourceCategory.MODEL_CODE,
        SourceClass.COMMUNITY,
        CollectionMethod.HTML,
        1_800,
        20,
        "none",
        "third_party",
        "https://ollama.com/terms",
        public_url="https://ollama.com/library",
    ),
    SourceSpec(
        "lmstudio",
        "LM Studio",
        "https://lmstudio.ai/models",
        SourceCategory.MODEL_CODE,
        SourceClass.COMMUNITY,
        CollectionMethod.HTML,
        43_200,
        20,
        "none",
        "third_party",
        "https://lmstudio.ai/terms",
        public_url="https://lmstudio.ai/models",
    ),
    SourceSpec(
        "github",
        "GitHub",
        "https://api.github.com",
        SourceCategory.MODEL_CODE,
        SourceClass.OFFICIAL,
        CollectionMethod.GITHUB,
        1_800,
        30,
        "optional_token",
        "official_api",
        "https://docs.github.com/site-policy/github-terms/github-terms-of-service",
        public_url="https://github.com/",
    ),
    SourceSpec(
        "arxiv",
        "arXiv",
        "http://export.arxiv.org/api/query",
        SourceCategory.RESEARCH,
        SourceClass.INDEPENDENT,
        CollectionMethod.ARXIV,
        21_600,
        20,
        "none",
        "academic",
        "https://info.arxiv.org/help/api/tou.html",
        public_url="https://arxiv.org/list/cs.AI/recent",
    ),
    SourceSpec(
        "openrouter",
        "OpenRouter",
        "https://openrouter.ai/api/v1/models",
        SourceCategory.MARKET,
        SourceClass.INDEPENDENT,
        CollectionMethod.REST,
        1_800,
        20,
        "none",
        "third_party",
        "https://openrouter.ai/terms",
        public_url="https://openrouter.ai/models",
    ),
    SourceSpec(
        "vercel-ai-gateway",
        "Vercel AI Gateway",
        "https://ai-gateway.vercel.sh/v1/models",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        1_800,
        20,
        "none",
        "third_party",
        "https://vercel.com/legal/terms",
        public_url="https://vercel.com/ai-gateway/models",
    ),
    SourceSpec(
        "aimlapi",
        "AI/ML API",
        "https://api.aimlapi.com/models",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        1_800,
        20,
        "none",
        "third_party",
        public_url="https://aimlapi.com/models",
    ),
    SourceSpec(
        "litellm",
        "LiteLLM Model Catalog",
        "https://api.litellm.ai/model_catalog",
        SourceCategory.MARKET,
        SourceClass.COMMUNITY,
        CollectionMethod.REST,
        21_600,
        10,
        "none",
        "community",
        "https://github.com/BerriAI/litellm/blob/main/LICENSE",
        public_url="https://docs.litellm.ai/docs/",
    ),
    SourceSpec(
        "nanogpt",
        "NanoGPT",
        "https://nano-gpt.com/api/v1/models?detailed=true",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        1_800,
        20,
        "optional_token",
        "third_party",
        public_url="https://nano-gpt.com/models",
    ),
    SourceSpec(
        "groqcloud",
        "GroqCloud",
        "https://api.groq.com/openai/v1/models",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        3_600,
        20,
        "api_key",
        "official_api",
        "https://groq.com/terms-of-use/",
        public_url="https://console.groq.com/docs/models",
    ),
    SourceSpec(
        "replicate",
        "Replicate",
        "https://api.replicate.com/v1/models",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        3_600,
        20,
        "api_key",
        "official_api",
        "https://replicate.com/terms",
        public_url="https://replicate.com/explore",
    ),
    SourceSpec(
        "together",
        "Together AI",
        "https://api.together.ai/v1/models",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        3_600,
        20,
        "api_key",
        "official_api",
        "https://www.together.ai/terms-of-service",
        public_url="https://www.together.ai/models",
    ),
    SourceSpec(
        "deepinfra",
        "DeepInfra",
        "https://api.deepinfra.com/models/list",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        3_600,
        20,
        "none",
        "official_api",
        "https://deepinfra.com/terms",
        public_url="https://deepinfra.com/models",
    ),
    SourceSpec(
        "fireworks",
        "Fireworks AI",
        "https://app.fireworks.ai/models?filter=LLM&serverless=true",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        3_600,
        20,
        "optional_api_key",
        "official_document",
        "https://fireworks.ai/terms-of-service",
        public_url="https://app.fireworks.ai/models?filter=LLM&serverless=true",
    ),
    SourceSpec(
        "cloudflare-workers-ai",
        "Cloudflare Workers AI",
        "https://developers.cloudflare.com/workers-ai/models/",
        SourceCategory.MARKET,
        SourceClass.OFFICIAL,
        CollectionMethod.REST,
        3_600,
        20,
        "optional_api_token",
        "official_document",
        "https://www.cloudflare.com/website-terms/",
        public_url="https://developers.cloudflare.com/workers-ai/models/",
    ),
    SourceSpec(
        "bifrost",
        "Bifrost",
        "https://getbifrost.ai/datasheet",
        SourceCategory.MARKET,
        SourceClass.COMMUNITY,
        CollectionMethod.REST,
        86_400,
        10,
        "none",
        "community",
        "https://github.com/maximhq/bifrost/blob/main/LICENSE",
        public_url="https://docs.getbifrost.ai/architecture/framework/model-catalog",
    ),
    SourceSpec(
        "arena",
        "Arena",
        "https://arena.ai/leaderboard/text",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        10,
        "none",
        "independent_measurement",
        public_url="https://arena.ai/leaderboard/text",
    ),
    SourceSpec(
        "swe-bench",
        "SWE-bench",
        "https://www.swebench.com/",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        6,
        "none",
        "academic",
        public_url="https://www.swebench.com/",
    ),
    SourceSpec(
        "swe-bench-live",
        "SWE-bench Live",
        "https://swe-bench-live.github.io/",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        6,
        "none",
        "academic",
        public_url="https://swe-bench-live.github.io/",
    ),
    SourceSpec(
        "artificial-analysis",
        "Artificial Analysis",
        "https://artificialanalysis.ai/",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        10,
        "api_key",
        "independent_measurement",
        public_url="https://artificialanalysis.ai/leaderboards/models",
    ),
    SourceSpec(
        "livebench",
        "LiveBench",
        "https://livebench.ai/",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        6,
        "none",
        "academic",
        public_url="https://livebench.ai/",
    ),
    SourceSpec(
        "mmlu-pro",
        "MMLU-Pro",
        "https://huggingface.co/spaces/TIGER-Lab/MMLU-Pro",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        6,
        "none",
        "academic",
        public_url="https://huggingface.co/spaces/TIGER-Lab/MMLU-Pro",
    ),
    SourceSpec(
        "livecodebench",
        "LiveCodeBench",
        "https://livecodebench.github.io/leaderboard.html",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        6,
        "none",
        "academic",
        public_url="https://livecodebench.github.io/leaderboard.html",
    ),
    SourceSpec(
        "tau-bench",
        "τ-bench",
        "https://taubench.com/",
        SourceCategory.BENCHMARK,
        SourceClass.INDEPENDENT,
        CollectionMethod.BENCHMARK,
        43_200,
        6,
        "none",
        "academic",
        public_url="https://taubench.com/",
    ),
)

SOURCE_BY_SLUG = {item.slug: item for item in SOURCE_CATALOG}

COMPARE_FIELDS = (
    "version",
    "release_date",
    "updated_at",
    "status",
    "license",
    "parameter_count",
    "active_parameter_count",
    "architecture",
    "context_window",
    "input_modalities",
    "output_modalities",
    "reasoning",
    "tool_calling",
    "mcp",
    "computer_use",
    "is_open_weight",
    "input_per_1m_tokens",
    "output_per_1m_tokens",
    "cache_read_per_1m_tokens",
    "cache_write_per_1m_tokens",
    "throughput_tokens_per_s",
    "time_to_first_token_ms",
    "benchmark_score",
    "leaderboard_rank",
    "api_available",
)

RANKING_CATEGORIES = (
    "general",
    "reasoning",
    "coding",
    "agent",
    "computer_use",
    "multimodal",
    "speed",
    "latency",
    "cost",
    "value",
    "open_weight",
    "local",
)

VALUE_SCENARIOS: dict[str, dict[str, float]] = {
    "chat": {
        "quality": 0.35,
        "input_price": 0.15,
        "output_price": 0.15,
        "cache": 0.05,
        "speed": 0.10,
        "context": 0.10,
        "reliability": 0.10,
    },
    "coding": {
        "quality": 0.40,
        "input_price": 0.10,
        "output_price": 0.15,
        "cache": 0.05,
        "speed": 0.10,
        "context": 0.05,
        "tool_use": 0.15,
    },
    "long_document": {
        "quality": 0.30,
        "input_price": 0.15,
        "output_price": 0.10,
        "cache": 0.15,
        "context": 0.25,
        "reliability": 0.05,
    },
    "agent": {
        "quality": 0.30,
        "input_price": 0.10,
        "output_price": 0.15,
        "speed": 0.10,
        "tool_use": 0.20,
        "reliability": 0.15,
    },
    "vision": {
        "quality": 0.35,
        "input_price": 0.15,
        "output_price": 0.10,
        "modality": 0.25,
        "speed": 0.15,
    },
    "local": {
        "quality": 0.30,
        "license": 0.20,
        "context": 0.15,
        "reliability": 0.15,
        "open_weight": 0.20,
    },
    "high_volume": {
        "quality": 0.20,
        "input_price": 0.25,
        "output_price": 0.25,
        "cache": 0.20,
        "speed": 0.10,
    },
    "low_latency": {"quality": 0.25, "speed": 0.35, "latency": 0.25, "reliability": 0.15},
}

TECHNOLOGY_KEYWORDS = {
    "agent": ("agent", "agentic", "tool use", "tool calling"),
    "mcp": ("mcp", "model context protocol"),
    "moe": ("moe", "mixture of experts", "mixture-of-experts"),
    "multimodal": ("multimodal", "vision", "image input", "video"),
    "model_routing": ("router", "model routing", "mixture of models"),
    "context_compaction": ("context compaction", "compaction", "memory"),
    "full_duplex_audio": ("full-duplex", "realtime audio", "speech-to-speech"),
    "computer_use": ("computer use", "computer-use", "browser use", "gui agent"),
    "reasoning": ("reasoning", "chain of thought", "thinking"),
    "open_weights": ("open weights", "open-weight", "open source model"),
}


def importance_for(event_type: str, payload: dict[str, Any] | None = None) -> Importance:
    spec = EVENT_BY_TYPE.get(event_type)
    level = spec.default_importance if spec else Importance.INFO
    payload = payload or {}
    if event_type == "price.changed":
        change = _abs_percent(payload.get("change_percentage"))
        if change is not None and change >= 50:
            return Importance.CRITICAL
        if change is not None and change >= 20:
            return Importance.HIGH
    if event_type == "leaderboard.changed":
        new_rank = payload.get("rank") or (payload.get("new_value") or {}).get("rank")
        if new_rank == 1:
            return Importance.CRITICAL
        if isinstance(new_rank, int) and new_rank <= 10:
            return Importance.HIGH
    if event_type == "model.deprecated":
        return Importance.CRITICAL
    return level


def _abs_percent(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return abs(Decimal(str(value)))
    except Exception:
        return None
