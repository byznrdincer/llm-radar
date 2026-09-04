import { modelHintFromTitle, toPublicSourceUrl } from "./publicSourceUrl";
import type { EventOrg, FeedEvent } from "./eventTypes";
import type { Language } from "./i18n";

export const CATEGORY_OPTIONS: [string, string][] = [
  ["model_release", "Model Release"],
  ["model_update", "Model Update"],
  ["ai_agent", "AI Agent"],
  ["benchmark", "Benchmark"],
  ["research", "Research"],
  ["funding", "Funding"],
  ["acquisition", "Acquisition"],
  ["product_launch", "Product Launch"],
  ["pricing_change", "Pricing Change"],
  ["api_update", "API Update"],
  ["infrastructure", "Infrastructure"],
  ["partnership", "Partnership"],
  ["regulation", "Regulation"],
  ["security", "Security"],
];

export const CATEGORY_CLASS: Record<string, string> = {
  model_release: "release",
  model_update: "release",
  benchmark: "benchmark",
  research: "research",
  funding: "funding",
  product_launch: "release",
  pricing_change: "price",
  api_update: "technology",
  infrastructure: "technology",
  partnership: "funding",
  technology: "technology",
};

const SOURCE_LABELS: Record<string, string> = {
  huggingface: "Hugging Face",
  github: "GitHub",
  arxiv: "arXiv",
  mistral: "Mistral",
  "google-deepmind": "Google DeepMind",
  "google-gemini-blog": "Google Gemini Blog",
  deepmind: "Google DeepMind",
  openai: "OpenAI",
  anthropic: "Anthropic",
  meta: "Meta",
  "meta-ai": "Meta",
  nvidia: "NVIDIA",
  "artificial-analysis": "Artificial Analysis",
  artificialanalysis: "Artificial Analysis",
  openrouter: "OpenRouter",
  nanogpt: "NanoGPT",
  "vercel-ai-gateway": "Vercel",
  vercel: "Vercel",
  xai: "xAI",
};

const BRAND_PATTERNS: [RegExp, string][] = [
  [/\bturkcell\b/i, "turkcell"],
  [/\btrendyol\b/i, "trendyol"],
  [/\bwiroai\b|\bwiro-ai\b/i, "wiroai"],
  [/\bvngrs\b/i, "vngrs"],
  [/\bmistral\b|\bministral\b|\bleanstral\b/i, "mistral"],
  [/\bmeta-llama\b|\bllama\b/i, "meta"],
  [/\bgemma\b|\bgemini\b/i, "google"],
  [/\bqwen\b|\btongyi\b/i, "alibaba"],
  [/\bnemotron\b|\bmuse[-_]/i, "nvidia"],
  [/\bdeepseek\b/i, "deepseek"],
  [/\bflux\b/i, "black-forest-labs"],
  [/\bstable[\s_-]?diffusion\b|\bsdxl\b|\bpony[\s_-]?diffusion\b/i, "stability"],
  [/\bjuggernaut\b/i, "rundiffusion"],
  [/\bopenai\b|\bgpt-?\d/i, "openai"],
  [/\banthropic\b|\bclaude\b/i, "anthropic"],
  [/\bminimax\b/i, "minimax"],
];

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function prettyName(slug: string): string {
  if (SOURCE_LABELS[slug]) return SOURCE_LABELS[slug];
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function inferBrand(...parts: Array<string | null | undefined>): string | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text) return null;
  for (const [pattern, brand] of BRAND_PATTERNS) {
    if (pattern.test(text)) return brand;
  }
  return null;
}

function hostSlug(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("huggingface.co")) return "huggingface";
    if (host.includes("github.com")) return "github";
    if (host.includes("arxiv.org")) return "arxiv";
    if (host.includes("mistral.ai")) return "mistral";
    if (host.includes("deepmind.google") || host.includes("deepmind.com")) return "deepmind";
    if (host.includes("research.google") || host.includes("ai.google")) return "google";
    if (host.includes("openai.com")) return "openai";
    if (host.includes("anthropic.com")) return "anthropic";
    if (host.includes("nvidia.com")) return "nvidia";
    if (host.includes("meta.com") || host.includes("ai.meta.com")) return "meta";
    if (host.includes("artificialanalysis.ai")) return "artificialanalysis";
    if (host.includes("openrouter.ai")) return "openrouter";
    if (host.includes("vercel.com")) return "vercel";
    if (host.includes("x.ai")) return "xai";
    const root = host.split(".").slice(-2, -1)[0];
    return root || null;
  } catch {
    return null;
  }
}

export function organization(event: FeedEvent): EventOrg {
  const value = event.new_value ?? {};
  const evidenceSource = (
    asString(event.evidence?.source)
    ?? asString(event.evidence?.sources?.[0]?.source)
  )?.toLowerCase() ?? null;
  const fromOrg = asString(value.organization)?.toLowerCase() ?? null;
  const fromExternal = asString(value.external_id)?.split("/")[0]?.toLowerCase() ?? null;
  const url = asString(value.url) ?? asString(event.evidence?.source_url) ?? asString(event.evidence?.sources?.[0]?.source_url);
  const fromUrl = hostSlug(url);
  const brand = inferBrand(fromOrg, fromExternal, event.title, asString(value.external_id), url);

  const slug = fromOrg || fromExternal || brand || fromUrl || evidenceSource || "unknown";
  const logoSlug = brand || fromOrg || fromExternal || evidenceSource || fromUrl || slug;
  const fallbackSlugs = Array.from(
    new Set(
      [brand, fromOrg, fromExternal, evidenceSource, fromUrl, "huggingface", "arxiv", "github"]
        .filter((value): value is string => Boolean(value) && value !== logoSlug),
    ),
  ).slice(0, 4);

  // Prefer company/marketing site for favicon; skip HF/GitHub repo pages as primary website.
  let websiteUrl: string | null = null;
  if (url && !/huggingface\.co|github\.com|arxiv\.org/i.test(url)) {
    websiteUrl = toPublicSourceUrl(url, { sourceSlug: evidenceSource });
  }

  return {
    slug,
    name: prettyName(fromOrg || brand || evidenceSource || slug),
    logoSlug,
    fallbackSlugs,
    websiteUrl,
  };
}

export function isJunkEvent(event: FeedEvent): boolean {
  const raw = (event.title || asString(event.new_value?.title) || "").trim().toLowerCase();
  if (!raw) return true;
  if (/^explore(\s+our)?\s+research/.test(raw)) return true;
  if (/^google research\b/.test(raw) && raw.length < 40) return true;
  if (/^(home|about|blog|news|research|publications)$/.test(raw)) return true;
  if (raw.length < 8) return true;
  return false;
}

export function sourceUrl(event: FeedEvent): string | null {
  const value = event.new_value ?? {};
  const evidenceSource = (
    asString(event.evidence?.source)
    ?? asString(event.evidence?.sources?.[0]?.source)
  );
  const modelHint = modelHintFromTitle(event.title);
  const raw =
    asString(value.url)
    || asString(value.repository)
    || asString(event.evidence?.source_url)
    || asString(event.evidence?.sources?.[0]?.source_url)
    || null;
  return toPublicSourceUrl(raw, {
    sourceSlug: evidenceSource,
    category: event.category,
    modelHint,
  });
}

export function sourceLabel(event: FeedEvent): string {
  const evidenceSource = (
    asString(event.evidence?.source)
    ?? asString(event.evidence?.sources?.[0]?.source)
  )?.toLowerCase() ?? null;
  if (evidenceSource && SOURCE_LABELS[evidenceSource]) return SOURCE_LABELS[evidenceSource];
  if (evidenceSource) return prettyName(evidenceSource);
  return organization(event).name;
}

export function categoryLabel(event: FeedEvent): string {
  return CATEGORY_OPTIONS.find(([value]) => value === event.category)?.[1]
    ?? event.category.replaceAll("_", " ");
}

export function categoryClass(event: FeedEvent): string {
  return CATEGORY_CLASS[event.category] ?? "other";
}

export function cleanTitle(event: FeedEvent, language: Language): string {
  let title = event.title || asString(event.new_value?.title) || (language === "tr" ? "Başlıksız gelişme" : "Untitled update");

  title = title
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/^Research\s+/i, "")
    .replace(/\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b.*$/i, "")
    .replace(/\s+By\s+.+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  title = language === "tr"
    ? title
        .replace(" discovered", " yayımlandı")
        .replace(": context_window changed", " — context penceresi değişti")
        .replace(/: (input|output|cache_read)_per_1m_tokens changed/, " — token fiyatı değişti")
        .replace(": Arena rank changed", " — sıralaması değişti")
    : title
        .replace(" discovered", " released")
        .replace(": context_window changed", " — context window changed")
        .replace(/: (input|output|cache_read)_per_1m_tokens changed/, " — token price changed")
        .replace(": Arena rank changed", " — ranking changed");

  if (title.length > 110) title = `${title.slice(0, 107).trim()}…`;
  return title;
}

export function eventSummary(event: FeedEvent, language: Language, locale: string): string | null {
  const value = event.new_value ?? {};
  const org = organization(event).name;

  if (event.event_type === "model.released" || event.category === "model_release") {
    const bits: string[] = [];
    if (value.is_open_weight === true) bits.push(language === "tr" ? "açık ağırlık" : "open weight");
    const license = asString(value.license);
    if (license) bits.push(license);
    const downloads = typeof value.downloads === "number" ? value.downloads : null;
    if (downloads != null && downloads > 0) {
      const formatted = new Intl.NumberFormat(locale, { notation: "compact" }).format(downloads);
      bits.push(language === "tr" ? `${formatted} indirme` : `${formatted} downloads`);
    }
    const pipeline = asString(value.pipeline_tag);
    if (pipeline) bits.push(pipeline.replaceAll("-", " "));
    if (bits.length) return `${org} · ${bits.join(" · ")}`;
    return language === "tr" ? `${org} tarafından yeni model yayımlandı.` : `New model released by ${org}.`;
  }
  if (event.event_type === "price.changed") {
    if (!event.change_percentage) {
      return language === "tr" ? "Yeni fiyat bilgisi kaydedildi." : "New pricing information recorded.";
    }
    const pct = Number(event.change_percentage);
    const formattedPct = Math.abs(pct).toLocaleString(locale, { maximumFractionDigits: 1 });
    return language === "tr"
      ? `Fiyat ${pct > 0 ? "yükseldi" : "düştü"}: %${formattedPct}`
      : `Price ${pct > 0 ? "increased" : "decreased"}: ${formattedPct}%`;
  }
  if (event.event_type === "leaderboard.changed" || event.category === "benchmark") {
    const before = Object.values(event.old_value ?? {})[0];
    const after = Object.values(event.new_value ?? {})[0];
    if (before != null && after != null) {
      return language === "tr" ? `Sıra #${before} → #${after}` : `Rank #${before} → #${after}`;
    }
  }
  if (event.event_type === "company.announcement" || event.category === "research") {
    return language === "tr" ? `${sourceLabel(event)} kaynaklı duyuru` : `Announcement from ${sourceLabel(event)}`;
  }
  return null;
}

export function eventTags(event: FeedEvent): string[] {
  const value = event.new_value ?? {};
  const tags: string[] = [];
  const org = organization(event);
  if (org.slug !== "unknown") tags.push(org.name);
  if (value.is_open_weight === true) tags.push("Open Weight");
  const tasks = Array.isArray(value.tasks) ? value.tasks.map(String) : [];
  if (tasks.some(t => t.toLowerCase().includes("reasoning"))) tags.push("Reasoning");
  if (tasks.some(t => t.includes("image") || t.includes("multimodal"))) tags.push("Multimodal");
  const params = value.parameter_count;
  if (typeof params === "number" && params > 0) {
    const b = params / 1_000_000_000;
    tags.push(b >= 1 ? `${b % 1 === 0 ? b : b.toFixed(1)}B` : `${Math.round(params / 1_000_000)}M`);
  }
  const license = asString(value.license);
  if (license && license !== "other") tags.push(license);
  return Array.from(new Set(tags)).slice(0, 5);
}

export function relativeTime(iso: string, language: Language, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return language === "tr" ? "Az önce" : "Just now";
  if (minutes < 60) return language === "tr" ? `${minutes} dk önce` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return language === "tr"
      ? `${hours} saat önce`
      : `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return language === "tr" ? "Dün" : "Yesterday";
  if (days < 7) return language === "tr" ? `${days} gün önce` : `${days} days ago`;
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function scoreLabel(importance: string, score: number): string {
  return `${importance.toUpperCase()} - ${score}`;
}

export function modelLevelLabel(level: string | null | undefined, language: Language): string | null {
  if (!level) return null;
  const labels: Record<string, Record<Language, string>> = {
    frontier: { tr: "Frontier", en: "Frontier" },
    advanced: { tr: "Yüksek", en: "High" },
    mid: { tr: "Orta", en: "Medium" },
    entry: { tr: "Başlangıç", en: "Entry" },
  };
  return labels[level]?.[language] ?? null;
}
