import type { CSSProperties } from "react";

const SLUG_ALIASES: Record<string, string> = {
    "z-ai": "zai",
    "zai-org": "zai",
    "x-ai": "xai",
    moonshotai: "moonshot",
    stabilityai: "stability",
    "stable-diffusion-v1-5": "stability",
    compvis: "stability",
    "google-deepmind": "deepmind",
    deepmind: "deepmind",
    gemini: "google",
    gemma: "google",
    doubao: "bytedance",
    "ibm-granite": "ibm",
    "bytedance-seed": "bytedance",
    "tencent-hunyuan": "tencent",
    "openai-community": "openai",
    "openai-pricing": "openai",
    "lmstudio-community": "lmstudio",
    rekaai: "reka",
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
    qwen: "alibaba",
    mistralai: "mistral",
    "meta-llama": "meta",
    "meta-ai": "meta",
    facebook: "meta",
    minimaxai: "minimax",
    "deepseek-ai": "deepseek",
    "blackforestlabs": "black-forest-labs",
    bfl: "black-forest-labs",
    "artificial-analysis": "artificialanalysis",
    "vercel-ai-gateway": "vercel",
};

const COMPANY_DOMAINS: Record<string, string> = {
    "01-ai": "01.ai",
    abacusai: "abacus.ai",
    abliteration: "abliteration.ai",
    ai21: "ai21.com",
    "aion-labs": "aionlabs.ai",
    allenai: "allenai.org",
    alibaba: "alibaba.com",
    amazon: "amazon.com",
    "anthracite-org": "anthracite.org",
    anthropic: "anthropic.com",
    apple: "apple.com",
    arcee: "arcee.ai",
    artificialanalysis: "artificialanalysis.ai",
    arena: "arena.ai",
    arxiv: "arxiv.org",
    baichuan: "baichuan-ai.com",
    baidu: "baidu.com",
    baseten: "baseten.co",
    "black-forest-labs": "bfl.ai",
    brave: "brave.com",
    bytedance: "bytedance.com",
    chutesai: "chutes.ai",
    cohere: "cohere.com",
    databricks: "databricks.com",
    "datalab-to": "datalab.to",
    deepcogito: "deepcogito.com",
    deepseek: "deepseek.com",
    "dots-studio": "dots.studio",
    dphn: "dphn.ai",
    eleutherai: "eleuther.ai",
    envoid: "envoid.io",
    exa: "exa.ai",
    featherless: "featherless.ai",
    fetchai: "fetch.ai",
    fireworks: "fireworks.ai",
    google: "google.com",
    "google-deepmind": "deepmind.google",
    deepmind: "deepmind.google",
    groq: "groq.com",
    holo: "holo.ai",
    huihui: "huihui.ai",
    ibm: "ibm.com",
    inception: "inceptionlabs.ai",
    inclusionai: "inclusion.ai",
    inflection: "inflection.ai",
    kagi: "kagi.com",
    kwaipilot: "kwaipilot.com",
    latitudegames: "latitude.io",
    lightx2v: "lightx2v.com",
    linkup: "linkup.so",
    liquid: "liquid.ai",
    llm360: "llm360.ai",
    lmstudio: "lmstudio.ai",
    longcat: "longcat.ai",
    lykon: "lykon.ai",
    meganova: "meganova.ai",
    meituan: "meituan.com",
    meta: "meta.com",
    microsoft: "microsoft.com",
    minimax: "minimax.io",
    mistral: "mistral.ai",
    moonshot: "moonshot.cn",
    morph: "morph.so",
    nanogpt: "nano-gpt.com",
    "nex-agi": "nex.ai",
    nomic: "nomic.ai",
    nousresearch: "nousresearch.com",
    nvidia: "nvidia.com",
    ollama: "ollama.com",
    openai: "openai.com",
    openrouter: "openrouter.ai",
    oracle: "oracle.com",
    ornith: "ornith.ai",
    perplexity: "perplexity.ai",
    playgroundai: "playground.com",
    poolside: "poolside.ai",
    radixark: "radixark.com",
    reka: "reka.ai",
    relace: "relace.ai",
    sakana: "sakana.ai",
    salesforce: "salesforce.com",
    sarvam: "sarvam.ai",
    shisa: "shisa.ai",
    snowflake: "snowflake.com",
    spacexai: "spacex.com",
    stability: "stability.ai",
    stablediffusionapi: "stablediffusionapi.com",
    stepfun: "stepfun.com",
    tee: "tee.ai",
    tencent: "tencent.com",
    tensorblock: "tensorblock.co",
    thinkingmachines: "thinkingmachines.com",
    thothai: "thoth.ai",
    lmsys: "lmsys.org",
    github: "github.com",
    huggingface: "huggingface.co",
    "meta-models": "meta.com",
    muse: "nvidia.com",
    rundiffusion: "rundiffusion.com",
    thudm: "thudm.cn",
    together: "together.ai",
    trendyol: "trendyol.com",
    turkcell: "turkcell.com.tr",
    unsloth: "unsloth.ai",
    upstage: "upstage.ai",
    venice: "venice.ai",
    vercel: "vercel.com",
    vngrs: "vngrs.com",
    wiroai: "wiro.ai",
    writer: "writer.com",
    xai: "x.ai",
    xiaomi: "xiaomi.com",
    zai: "z.ai",
    zhipu: "zhipuai.cn",
};

const UNTRUSTED_HOSTS = new Set(["huggingface.co", "github.com", "localhost"]);

function hostnameFromUrl(url: string | null | undefined) {
    if (!url)
        return null;
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    }
    catch {
        return null;
    }
}

export function canonicalCompanySlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    if (SLUG_ALIASES[normalized])
        return SLUG_ALIASES[normalized];
    if (COMPANY_DOMAINS[normalized])
        return normalized;
    for (const suffix of ["-ai", "-labs", "-org"]) {
        if (normalized.endsWith(suffix)) {
            const base = normalized.slice(0, -suffix.length);
            if (COMPANY_DOMAINS[base])
                return base;
        }
    }
    return normalized;
}

export function knownCompanyDomain(slug: string, websiteUrl?: string | null): string | null {
    const mapped = COMPANY_DOMAINS[canonicalCompanySlug(slug)] ?? COMPANY_DOMAINS[slug.trim().toLowerCase()];
    if (mapped)
        return mapped;
    const host = hostnameFromUrl(websiteUrl);
    if (host && !UNTRUSTED_HOSTS.has(host))
        return host;
    return null;
}

export function resolveCompanyDomain(slug: string, websiteUrl?: string | null) {
    return knownCompanyDomain(slug, websiteUrl);
}

function companySiteUrl(domain: string, websiteUrl?: string | null) {
    const host = hostnameFromUrl(websiteUrl);
    if (host === domain) {
        try {
            return new URL(websiteUrl!).toString();
        }
        catch {
            return `https://www.${domain}/`;
        }
    }
    return `https://www.${domain}/`;
}

export function companyLogoUrls(slug: string, websiteUrl?: string | null, fallbackSlugs: string[] = []) {
    const candidates = [slug, ...fallbackSlugs].filter(Boolean);
    for (const candidate of candidates) {
        const domain = knownCompanyDomain(candidate, websiteUrl);
        if (!domain)
            continue;
        const siteUrl = companySiteUrl(domain, websiteUrl);
        const encodedDomain = encodeURIComponent(domain);
        const encodedSiteUrl = encodeURIComponent(siteUrl);
        return [
            `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodedSiteUrl}&size=128`,
            `https://logo.clearbit.com/${encodedDomain}`,
            `https://icons.duckduckgo.com/ip3/${encodedDomain}.ico`,
            `https://www.${domain}/favicon.ico`,
            `https://www.${domain}/apple-touch-icon.png`,
        ];
    }
    return [];
}

export function companyLogoUrl(slug: string, websiteUrl?: string | null) {
    return companyLogoUrls(slug, websiteUrl)[0] ?? null;
}

export function companyInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length)
        return "?";
    if (parts.length === 1)
        return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function companyAvatarHue(slug: string) {
    let hash = 0;
    for (let i = 0; i < slug.length; i += 1)
        hash = slug.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
}

export function companyAvatarStyle(slug: string): CSSProperties {
    const hue = companyAvatarHue(slug);
    return {
        background: `hsl(${hue} 30% 91%)`,
        color: `hsl(${hue} 36% 30%)`,
        borderColor: `hsl(${hue} 22% 82%)`,
    };
}
