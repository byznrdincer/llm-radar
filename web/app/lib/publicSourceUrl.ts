/** Rewrite collector/machine URLs into pages humans can actually read. */

export type PublicSourceOptions = {
  sourceSlug?: string | null;
  category?: string | null;
  modelHint?: string | null;
};

const SOURCE_HOME: Record<string, string> = {
  openrouter: "https://openrouter.ai/models",
  nanogpt: "https://nano-gpt.com/settings/models",
  bifrost: "https://www.getmaxim.ai/bifrost/model-library?utm_source=chatgpt.com",
  "ai-ml-api": "https://docs.aimlapi.com/api-references/service-endpoints/complete-model-list?utm_source=chatgpt.com",
  aimlapi: "https://docs.aimlapi.com/api-references/service-endpoints/complete-model-list?utm_source=chatgpt.com",
  deepinfra: "https://deepinfra.com/models",
  groqcloud: "https://console.groq.com/docs/models",
  groq: "https://console.groq.com/docs/models",
  replicate: "https://replicate.com/explore",
  together: "https://www.together.ai/models",
  "google-gemini-blog": "https://blog.google/innovation-and-ai/models-and-research/gemini-models/",
  "vercel-ai-gateway": "https://vercel.com/docs/ai-gateway/pricing",
  vercel: "https://vercel.com/docs/ai-gateway/pricing",
  "openai-pricing": "https://developers.openai.com/api/docs/pricing",
  openai: "https://developers.openai.com/api/docs/pricing",
  "artificial-analysis": "https://artificialanalysis.ai/leaderboards/models",
  artificialanalysis: "https://artificialanalysis.ai/leaderboards/models",
  huggingface: "https://huggingface.co/models",
  github: "https://github.com/",
  arxiv: "https://arxiv.org/",
  mistral: "https://mistral.ai/news",
  anthropic: "https://www.anthropic.com/news",
  "google-deepmind": "https://deepmind.google/discover/blog/",
  deepmind: "https://deepmind.google/discover/blog/",
  nvidia: "https://blogs.nvidia.com/",
  "nvidia-generative-ai": "https://blogs.nvidia.com/blog/category/generative-ai/",
  "meta-ai": "https://ai.meta.com/blog/",
  meta: "https://ai.meta.com/blog/",
  xai: "https://x.ai/",
};

function isMachinePath(path: string): boolean {
  if (path.endsWith(".md") || path.endsWith(".json") || path.endsWith(".xml")) return true;
  if (path.includes("/api/")) return true;
  if (/\/v\d+(\/|$)/.test(path)) return true;
  return false;
}

/** Extract a model slug from event titles like "moonshot/kimi-latest: input_per_1m_tokens changed". */
export function modelHintFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const hint = title
    .replace(/: (input|output|cache_read|cache_write)_per_1m_tokens changed$/i, "")
    .replace(/: context_window changed$/i, "")
    .replace(/ — token fiyatı değişti$/i, "")
    .trim();
  if (!hint) return null;

  // provider/model slug (moonshot/kimi-latest, gemini/gemini-2.5-flash-...)
  if (/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i.test(hint)) {
    return hint.toLowerCase();
  }

  // single-segment API id (gpt-5.1-codex-max, deepseek/deepseek-v4-... without slash won't match above)
  if (/^[a-z0-9][a-z0-9._-]*$/i.test(hint) && /[._-]/.test(hint) && !/\s/.test(hint)) {
    return hint.toLowerCase();
  }

  return null;
}

function providerModelUrl(sourceSlug: string, modelSlug: string): string | null {
  if (sourceSlug === "openrouter") {
    return `https://openrouter.ai/${modelSlug}`;
  }
  return null;
}

export function toPublicSourceUrl(
  raw: string | null | undefined,
  options: PublicSourceOptions = {},
): string | null {
  const sourceSlug = options.sourceSlug?.trim().toLowerCase() ?? null;
  const category = options.category?.trim().toLowerCase() ?? null;
  const modelSlug = options.modelHint?.trim().toLowerCase() ?? null;

  if (sourceSlug && [
    "bifrost",
    "ai-ml-api",
    "aimlapi",
    "nanogpt",
    "deepinfra",
    "groqcloud",
    "groq",
    "replicate",
    "together",
    "google-gemini-blog",
    "nvidia-generative-ai",
  ].includes(sourceSlug)) {
    return SOURCE_HOME[sourceSlug];
  }

  // Pricing/catalog events: link to the specific model page when we know the slug.
  if (modelSlug && sourceSlug && (category === "pricing_change" || category === "model_release")) {
    const direct = providerModelUrl(sourceSlug, modelSlug);
    if (direct) return direct;
  }

  if (!raw || !raw.trim()) {
    return sourceSlug ? SOURCE_HOME[sourceSlug] ?? null : null;
  }

  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname;

    if (path.endsWith(".md")) {
      url.pathname = path.slice(0, -3) || "/";
      return url.toString();
    }

    if (host === "openrouter.ai" && (path.startsWith("/api/") || path.includes("/v1/"))) {
      if (modelSlug) return `https://openrouter.ai/${modelSlug}`;
      return SOURCE_HOME.openrouter;
    }
    if (host === "nano-gpt.com" && isMachinePath(path)) {
      if (modelSlug) return `https://nano-gpt.com/models/${modelSlug}`;
      return SOURCE_HOME.nanogpt;
    }
    if (host === "ai-gateway.vercel.sh" || (host === "vercel.com" && path.includes("/v1/"))) {
      return SOURCE_HOME["vercel-ai-gateway"];
    }
    if (host === "developers.openai.com" && path.includes("pricing")) {
      return SOURCE_HOME["openai-pricing"];
    }
    if (host === "openai.com" && (path.includes("/api/") || isMachinePath(path))) {
      return SOURCE_HOME.openai;
    }

    if (host.startsWith("api.") || host.endsWith(".api.openai.com") || isMachinePath(path)) {
      if (sourceSlug && SOURCE_HOME[sourceSlug]) return SOURCE_HOME[sourceSlug];
      return `${url.protocol}//${url.host}/`;
    }

    if (host === "artificialanalysis.ai" && (path === "/" || path === "")) {
      return SOURCE_HOME["artificial-analysis"];
    }

    return url.toString();
  } catch {
    if (sourceSlug && SOURCE_HOME[sourceSlug]) return SOURCE_HOME[sourceSlug];
    return raw;
  }
}
