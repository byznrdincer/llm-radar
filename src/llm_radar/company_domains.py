"""Known company website domains for logo resolution and metadata."""

from __future__ import annotations

SLUG_ALIASES: dict[str, str] = {
    "z-ai": "zai",
    "zai-org": "zai",
    "x-ai": "xai",
    "moonshotai": "moonshot",
    "stabilityai": "stability",
    "gemini": "google",
    "doubao": "bytedance",
    "ibm-granite": "ibm",
    "bytedance-seed": "bytedance",
    "tencent-hunyuan": "tencent",
    "openai-community": "openai",
    "lmstudio-community": "lmstudio",
    "rekaai": "reka",
    "fetchai": "fetchai",
    "arcee-ai": "arcee",
    "featherless-ai": "featherless",
    "ornith-ai": "ornith",
    "shisa-ai": "shisa",
    "vngrs-ai": "vngrs",
    "meganova-ai": "meganova",
    "stepfun-ai": "stepfun",
    "abliteration-ai": "abliteration",
    "huihui-ai": "huihui",
    "tongyi-mai": "alibaba",
    "tongyi-zhiwen": "alibaba",
    "qwen": "alibaba",
    "stable-diffusion-v1-5": "stability",
}

COMPANY_DOMAINS: dict[str, str] = {
    "01-ai": "01.ai",
    "abacusai": "abacus.ai",
    "abliteration": "abliteration.ai",
    "ai21": "ai21.com",
    "aion-labs": "aionlabs.ai",
    "allenai": "allenai.org",
    "alibaba": "alibaba.com",
    "amazon": "amazon.com",
    "anthracite-org": "anthracite.org",
    "anthropic": "anthropic.com",
    "arcee": "arcee.ai",
    "baichuan": "baichuan-ai.com",
    "baidu": "baidu.com",
    "baseten": "baseten.co",
    "black-forest-labs": "bfl.ai",
    "brave": "brave.com",
    "bytedance": "bytedance.com",
    "chutesai": "chutes.ai",
    "cohere": "cohere.com",
    "crofai": "crof.ai",
    "datalab-to": "datalab.to",
    "deepcogito": "deepcogito.com",
    "deepseek": "deepseek.com",
    "dots-studio": "dots.studio",
    "dphn": "dphn.ai",
    "eleutherai": "eleuther.ai",
    "envoid": "envoid.io",
    "exa": "exa.ai",
    "featherless": "featherless.ai",
    "fetchai": "fetch.ai",
    "google": "google.com",
    "holo": "holo.ai",
    "huihui": "huihui.ai",
    "ibm": "ibm.com",
    "inception": "inceptionlabs.ai",
    "inclusionai": "inclusion.ai",
    "inflection": "inflection.ai",
    "kagi": "kagi.com",
    "kwaipilot": "kwaipilot.com",
    "latitudegames": "latitude.io",
    "lightx2v": "lightx2v.com",
    "linkup": "linkup.so",
    "liquid": "liquid.ai",
    "llm360": "llm360.ai",
    "lmstudio": "lmstudio.ai",
    "longcat": "longcat.ai",
    "lykon": "lykon.ai",
    "meganova": "meganova.ai",
    "meituan": "meituan.com",
    "meta": "meta.com",
    "microsoft": "microsoft.com",
    "minimax": "minimax.io",
    "mistral": "mistral.ai",
    "moonshot": "moonshot.cn",
    "morph": "morph.so",
    "nanogpt": "nano-gpt.com",
    "nex-agi": "nex.ai",
    "nousresearch": "nousresearch.com",
    "nvidia": "nvidia.com",
    "ollama": "ollama.com",
    "openai": "openai.com",
    "openrouter": "openrouter.ai",
    "ornith": "ornith.ai",
    "perplexity": "perplexity.ai",
    "playgroundai": "playground.com",
    "poolside": "poolside.ai",
    "radixark": "radixark.com",
    "reka": "reka.ai",
    "relace": "relace.ai",
    "sakana": "sakana.ai",
    "salesforce": "salesforce.com",
    "sarvam": "sarvam.ai",
    "shisa": "shisa.ai",
    "spacexai": "spacex.com",
    "stability": "stability.ai",
    "stablediffusionapi": "stablediffusionapi.com",
    "stepfun": "stepfun.com",
    "tee": "tee.ai",
    "tencent": "tencent.com",
    "tensorblock": "tensorblock.co",
    "thinkingmachines": "thinkingmachines.com",
    "thothai": "thoth.ai",
    "thudm": "thudm.cn",
    "turkcell": "turkcell.com.tr",
    "unsloth": "unsloth.ai",
    "upstage": "upstage.ai",
    "venice": "venice.ai",
    "vngrs": "vngrs.com",
    "wiroai": "wiro.ai",
    "writer": "writer.com",
    "xai": "x.ai",
    "xiaomi": "xiaomi.com",
    "zai": "z.ai",
}


def canonical_company_slug(slug: str) -> str:
    normalized = slug.strip().lower()
    if normalized in SLUG_ALIASES:
        return SLUG_ALIASES[normalized]
    if normalized in COMPANY_DOMAINS:
        return normalized
    for suffix in ("-ai", "-labs", "-org"):
        if normalized.endswith(suffix):
            base = normalized[: -len(suffix)]
            if base in COMPANY_DOMAINS:
                return base
    return normalized


def known_company_domain(slug: str) -> str | None:
    canonical = canonical_company_slug(slug)
    if canonical in COMPANY_DOMAINS:
        return COMPANY_DOMAINS[canonical]
    normalized = slug.strip().lower()
    if normalized in COMPANY_DOMAINS:
        return COMPANY_DOMAINS[normalized]
    return None


def company_website_url(slug: str) -> str | None:
    domain = known_company_domain(slug)
    if domain is None:
        return None
    return f"https://{domain}/"
