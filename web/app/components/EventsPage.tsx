"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModelAvatar from "./ModelAvatar";
import {
  loadSavedEvents,
  savedEventList,
  toggleSavedEvent,
  type SavedEventRecord,
} from "../lib/savedEvents";
import { useInfiniteScroll } from "../lib/useInfiniteScroll";
import { toPublicSourceUrl, modelHintFromTitle } from "../lib/publicSourceUrl";
import { useLanguage, type Language } from "../lib/i18n";

export type FeedEvent = {
  id: string;
  event_type: string;
  category: string;
  entity_id: string;
  title: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  change_percentage: string | null;
  importance: string;
  importance_score: number;
  model_openness?: string | null;
  model_level?: string | null;
  detected_at: string;
  evidence?: {
    source?: string;
    source_url?: string;
    sources?: { source?: string; source_url?: string }[];
  } | null;
};

const CATEGORY_OPTIONS: [string, string][] = [
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

const CATEGORY_CLASS: Record<string, string> = {
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

type EventOrg = {
  slug: string;
  name: string;
  logoSlug: string;
  fallbackSlugs: string[];
  websiteUrl: string | null;
};

function organization(event: FeedEvent): EventOrg {
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

function isJunkEvent(event: FeedEvent): boolean {
  const raw = (event.title || asString(event.new_value?.title) || "").trim().toLowerCase();
  if (!raw) return true;
  if (/^explore(\s+our)?\s+research/.test(raw)) return true;
  if (/^google research\b/.test(raw) && raw.length < 40) return true;
  if (/^(home|about|blog|news|research|publications)$/.test(raw)) return true;
  if (raw.length < 8) return true;
  return false;
}

function sourceUrl(event: FeedEvent): string | null {
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

function sourceLabel(event: FeedEvent): string {
  const evidenceSource = (
    asString(event.evidence?.source)
    ?? asString(event.evidence?.sources?.[0]?.source)
  )?.toLowerCase() ?? null;
  if (evidenceSource && SOURCE_LABELS[evidenceSource]) return SOURCE_LABELS[evidenceSource];
  if (evidenceSource) return prettyName(evidenceSource);
  return organization(event).name;
}

function categoryLabel(event: FeedEvent): string {
  return CATEGORY_OPTIONS.find(([value]) => value === event.category)?.[1]
    ?? event.category.replaceAll("_", " ");
}

function categoryClass(event: FeedEvent): string {
  return CATEGORY_CLASS[event.category] ?? "other";
}

function cleanTitle(event: FeedEvent, language: Language): string {
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

function eventSummary(event: FeedEvent, language: Language, locale: string): string | null {
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

function eventTags(event: FeedEvent): string[] {
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

function relativeTime(iso: string, language: Language, locale: string): string {
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

function scoreLabel(importance: string, score: number): string {
  return `${importance.toUpperCase()} - ${score}`;
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V20l-6-3.5L6 20V4.5Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  api: string;
  category: string;
  days: string;
  onCategoryChange: (value: string) => void;
  onDaysChange: (value: string) => void;
};

const PAGE_SIZE = 12;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

type EventSort = "recent" | "importance";

function eventQueryParams({
  offset,
  category,
  days,
  query,
  importance,
  openness,
  modelLevel,
  sortBy,
}: {
  offset: number;
  category: string;
  days: string;
  query: string;
  importance: string;
  openness: string;
  modelLevel: string;
  sortBy: EventSort;
}): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sort_by: sortBy,
  });
  if (category !== "any") params.set("category", category);
  if (days !== "any") params.set("since", daysAgoIso(Number(days)));
  if (query.trim()) params.set("search", query.trim());
  if (importance !== "any") params.set("importance", importance);
  if (openness !== "any") params.set("openness", openness);
  if (modelLevel !== "any") params.set("model_level", modelLevel);
  return params;
}

function eventMatchesFilters(
  event: FeedEvent,
  filters: {
    category: string;
    days: string;
    query: string;
    importance: string;
    openness: string;
    modelLevel: string;
  },
  locale: string,
): boolean {
  if (filters.category !== "any" && event.category !== filters.category) return false;
  if (filters.importance !== "any" && event.importance !== filters.importance) return false;
  if (filters.days !== "any") {
    const cutoff = Date.now() - Number(filters.days) * 24 * 60 * 60 * 1000;
    if (new Date(event.detected_at).getTime() < cutoff) return false;
  }
  // Openness is resolved server-side from the model's canonical profile -
  // a live-streamed event can't be safely classified client-side, so while
  // an openness filter is active it's left for the next authoritative fetch
  // instead of guessing.
  if (filters.openness !== "any") return false;
  if (filters.modelLevel !== "any") return false;
  const query = filters.query.trim().toLocaleLowerCase(locale);
  return !query || event.title.toLocaleLowerCase(locale).includes(query);
}

type EventCardProps = {
  event: FeedEvent;
  saved: boolean;
  onToggleSave: () => void;
};

function EventCard({ event, saved, onToggleSave }: EventCardProps) {
  const { language, locale } = useLanguage();
  const org = organization(event);
  const url = sourceUrl(event);
  const summary = eventSummary(event, language, locale);

  return (
    <article className="ev-card">
      <div className="ev-card-top">
        <ModelAvatar
          name={org.name}
          companySlug={org.logoSlug}
          companyName={org.name}
          websiteUrl={org.websiteUrl}
          fallbackSlugs={org.fallbackSlugs}
          size="md"
        />
        <div className="ev-badges">
          <span className={`ev-cat ev-${categoryClass(event)}`}>{categoryLabel(event)}</span>
          <span className={`ev-score ${event.importance}`}>
            {scoreLabel(event.importance, event.importance_score)}
          </span>
        </div>
      </div>
      <h4>{cleanTitle(event, language)}</h4>
      {summary && <p>{summary}</p>}
      <footer>
        <span className="ev-card-meta">
          <strong>{sourceLabel(event)}</strong>
          <span aria-hidden="true">•</span>
          <time>{relativeTime(event.detected_at, language, locale)}</time>
        </span>
        <div className="ev-card-actions">
          {url && (
            <a href={url} target="_blank" rel="noreferrer" aria-label={language === "tr" ? "Kaynağı aç" : "Open source"}>↗</a>
          )}
          <button
            type="button"
            className={saved ? "on" : ""}
            aria-label={
              saved
                ? (language === "tr" ? "Kaydı kaldır" : "Remove from saved")
                : (language === "tr" ? "Kaydet" : "Save")
            }
            aria-pressed={saved}
            onClick={onToggleSave}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
      </footer>
    </article>
  );
}

const STRINGS: Record<Language, {
  heading: string;
  subtitle: string;
  methodologyButton: string;
  methodologyNote: string;
  searchLabel: string;
  searchPlaceholder: string;
  categoryLabel: string;
  categoryAll: string;
  timeLabel: string;
  timeAll: string;
  time6h: string;
  time24h: string;
  time48h: string;
  time7d: string;
  time30d: string;
  time90d: string;
  importanceLabel: string;
  importanceAll: string;
  importanceCritical: string;
  importanceHigh: string;
  importanceMedium: string;
  importanceLow: string;
  importanceInfo: string;
  opennessLabel: string;
  opennessAll: string;
  opennessOpenSource: string;
  opennessOpenWeight: string;
  opennessProprietary: string;
  modelLevelLabel: string;
  modelLevelAll: string;
  modelLevelFrontier: string;
  modelLevelHigh: string;
  modelLevelMedium: string;
  sortLabel: string;
  sortRecent: string;
  sortImportance: string;
  clearFilters: string;
  featured: string;
  sourcePrefix: string;
  viewDetails: string;
  noDetails: string;
  viewAriaLabel: string;
  recentTab: string;
  savedTab: string;
  loading: string;
  emptySaved: string;
  emptyOther: string;
  emptyFiltered: string;
  loadingMore: string;
}> = {
  tr: {
    heading: "Teknoloji gelişmeleri",
    subtitle: "AI ekosistemindeki önemli değişiklikleri takip et.",
    methodologyButton: "Skorlama metodolojisi",
    methodologyNote: "Gelişmeler kaynak güvenilirliği, değişimin büyüklüğü, sektörel etki ve doğrulama durumuyla 0–100 puanlanır.",
    searchLabel: "Gelişme ara",
    searchPlaceholder: "Örn. Gemini 3.8",
    categoryLabel: "Kategori",
    categoryAll: "Tümü",
    timeLabel: "Zaman",
    timeAll: "Tüm zamanlar",
    time6h: "Son 6 saat",
    time24h: "Son 24 saat",
    time48h: "Son 48 saat",
    time7d: "Son 7 gün",
    time30d: "Son 30 gün",
    time90d: "Son 90 gün",
    importanceLabel: "Önem",
    importanceAll: "Tüm seviyeler",
    importanceCritical: "Kritik",
    importanceHigh: "Yüksek",
    importanceMedium: "Orta",
    importanceLow: "Düşük",
    importanceInfo: "Bilgi",
    opennessLabel: "Açıklık",
    opennessAll: "Tümü",
    opennessOpenSource: "Açık Kaynak",
    opennessOpenWeight: "Açık Ağırlık",
    opennessProprietary: "Kapalı Kaynak",
    modelLevelLabel: "Model seviyesi",
    modelLevelAll: "Tüm seviyeler",
    modelLevelFrontier: "Frontier",
    modelLevelHigh: "Yüksek",
    modelLevelMedium: "Orta",
    sortLabel: "Sıralama",
    sortRecent: "En yeni",
    sortImportance: "En önemli",
    clearFilters: "Filtreleri temizle",
    featured: "Öne çıkan",
    sourcePrefix: "Kaynak:",
    viewDetails: "Detayı gör →",
    noDetails: "Detay yok",
    viewAriaLabel: "Gelişme görünümü",
    recentTab: "Son gelişmeler",
    savedTab: "Kaydedilenler",
    loading: "Gelişmeler yükleniyor…",
    emptySaved: "Henüz kaydedilmiş gelişme yok. Kartlardaki yer imine tıklayarak kaydedebilirsin.",
    emptyOther: "Başka gelişme yok.",
    emptyFiltered: "Bu filtrelerle gelişme bulunamadı.",
    loadingMore: "Daha fazla yükleniyor…",
  },
  en: {
    heading: "Technology updates",
    subtitle: "Track the key changes across the AI ecosystem.",
    methodologyButton: "Scoring methodology",
    methodologyNote: "Updates are scored 0–100 based on source reliability, magnitude of change, industry impact, and verification status.",
    searchLabel: "Search updates",
    searchPlaceholder: "e.g. Gemini 3.8",
    categoryLabel: "Category",
    categoryAll: "All",
    timeLabel: "Time",
    timeAll: "All time",
    time6h: "Last 6 hours",
    time24h: "Last 24 hours",
    time48h: "Last 48 hours",
    time7d: "Last 7 days",
    time30d: "Last 30 days",
    time90d: "Last 90 days",
    importanceLabel: "Importance",
    importanceAll: "All levels",
    importanceCritical: "Critical",
    importanceHigh: "High",
    importanceMedium: "Medium",
    importanceLow: "Low",
    importanceInfo: "Info",
    opennessLabel: "Openness",
    opennessAll: "All",
    opennessOpenSource: "Open Source",
    opennessOpenWeight: "Open Weight",
    opennessProprietary: "Closed Source",
    modelLevelLabel: "Model level",
    modelLevelAll: "All levels",
    modelLevelFrontier: "Frontier",
    modelLevelHigh: "High",
    modelLevelMedium: "Medium",
    sortLabel: "Sort",
    sortRecent: "Newest",
    sortImportance: "Most important",
    clearFilters: "Clear filters",
    featured: "Featured",
    sourcePrefix: "Source:",
    viewDetails: "View details →",
    noDetails: "No details",
    viewAriaLabel: "Event view",
    recentTab: "Recent updates",
    savedTab: "Saved",
    loading: "Loading updates…",
    emptySaved: "No saved updates yet. Click the bookmark icon on a card to save it.",
    emptyOther: "No other updates.",
    emptyFiltered: "No updates found for these filters.",
    loadingMore: "Loading more…",
  },
};

export default function EventsPage({
  api,
  category,
  days,
  onCategoryChange,
  onDaysChange,
}: Props) {
  const { language, locale } = useLanguage();
  const t = STRINGS[language];
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [savedMap, setSavedMap] = useState<Record<string, SavedEventRecord>>({});
  const [view, setView] = useState<"all" | "saved">("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [importance, setImportance] = useState("any");
  const [openness, setOpenness] = useState("any");
  const [modelLevel, setModelLevel] = useState("any");
  const [sortBy, setSortBy] = useState<EventSort>("importance");
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setSavedMap(loadSavedEvents());
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setEvents([]);
    setTotal(0);
    setNextOffset(0);

    const params = eventQueryParams({
      offset: 0,
      category,
      days,
      query: debouncedQuery,
      importance,
      openness,
      modelLevel,
      sortBy,
    });

    fetch(`${api}/api/v1/events?${params}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("events");
        return response.json();
      })
      .then(data => {
        const raw = (data.items ?? []) as FeedEvent[];
        setEvents(raw.filter(event => !isJunkEvent(event)));
        setTotal(Number(data.total ?? raw.length));
        setNextOffset(Number(data.offset ?? 0) + Number(data.limit ?? PAGE_SIZE));
      })
      .catch(error => {
        if (error.name !== "AbortError") setEvents([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [api, category, days, debouncedQuery, importance, openness, modelLevel, sortBy]);

  useEffect(() => {
    const stream = new EventSource(`${api}/api/v1/stream/events`);
    stream.addEventListener("change", ev => {
      try {
        const incoming = JSON.parse(ev.data) as FeedEvent;
        if (isJunkEvent(incoming)) return;
        if (!eventMatchesFilters(
          incoming,
          { category, days, query: debouncedQuery, importance, openness, modelLevel },
          locale,
        )) return;
        setEvents(current => {
          if (current.some(event => event.id === incoming.id)) return current;
          const updated = [incoming, ...current];
          return sortBy === "recent"
            ? updated.sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at))
            : updated.sort((a, b) => b.importance_score - a.importance_score);
        });
        setTotal(current => current + 1);
      } catch {
        /* ignore malformed payloads */
      }
    });
    return () => stream.close();
  }, [api, category, days, debouncedQuery, importance, openness, modelLevel, sortBy, locale]);

  const savedCount = Object.keys(savedMap).length;
  const savedEvents = useMemo(() => savedEventList(savedMap).map(record => record.event), [savedMap]);

  const featured = view === "all" ? events[0] ?? null : null;
  const rest = useMemo(
    () => (view === "all" ? events.slice(1) : savedEvents),
    [events, savedEvents, view],
  );
  const hasMore = view === "all" && nextOffset < total && !loading;

  async function fetchEventsPage(offset: number) {
    const params = eventQueryParams({
      offset,
      category,
      days,
      query: debouncedQuery,
      importance,
      openness,
      modelLevel,
      sortBy,
    });
    const response = await fetch(`${api}/api/v1/events?${params}`);
    if (!response.ok) throw new Error("events");
    const data = await response.json();
    const raw = (data.items ?? []) as FeedEvent[];
    let addedCount = 0;
    setEvents(current => {
      const seen = new Set(current.map(event => event.id));
      const fresh = raw.filter(event => !isJunkEvent(event) && !seen.has(event.id));
      addedCount = fresh.length;
      return [...current, ...fresh];
    });
    const newTotal = typeof data.total === "number" ? data.total : total;
    if (typeof data.total === "number") setTotal(data.total);
    const newOffset = Number(data.offset ?? offset) + Number(data.limit ?? PAGE_SIZE);
    setNextOffset(newOffset);
    return { addedCount, newOffset, newTotal };
  }

  const loadMore = async () => {
    if (!hasMore || loadingMoreRef.current || loadingMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      let offset = nextOffset;
      let attempts = 0;
      // Bir sayfa tamamen "junk" (isJunkEvent) event'lerden olusursa ekrana yeni kart
      // eklenmiyor, sentinel yer degistirmiyor ve IntersectionObserver bir daha
      // tetiklenmedigi icin sonsuz scroll donuyordu. Bos sayfa geldiginde otomatik
      // olarak bir sonraki sayfayi cekmeye devam ediyoruz (asiri istek atmayi
      // onlemek icin art arda en fazla 8 sayfa).
      while (attempts < 8) {
        const { addedCount, newOffset, newTotal } = await fetchEventsPage(offset);
        attempts += 1;
        if (addedCount > 0 || newOffset >= newTotal) break;
        offset = newOffset;
      }
    } catch {
      /* keep current page */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && view === "all");

  const handleToggleSave = (event: FeedEvent) => {
    setSavedMap(current => toggleSavedEvent(event, current));
  };

  return (
    <section className="ev-page" id="events">
      <header className="ev-hero">
        <div className="ev-hero-copy">
          <h2>{t.heading}</h2>
          <p className="ev-subtitle">{t.subtitle}</p>
        </div>
        <button type="button" className="ev-method-btn" onClick={() => setMethodOpen(open => !open)}>
          <span aria-hidden="true">ⓘ</span> {t.methodologyButton}
        </button>
      </header>

      {methodOpen && (
        <p className="ev-method-note">
          {t.methodologyNote}
        </p>
      )}

      <div className="ev-filters">
        <label className="ev-filter ev-filter-search">
          <span>{t.searchLabel}</span>
          <div className="ev-search-wrap">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              placeholder={t.searchPlaceholder}
              onChange={event => {
                setQuery(event.target.value);
                setView("all");
              }}
            />
          </div>
        </label>
        <label className="ev-filter">
          <span>{t.categoryLabel}</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">▦</span>
            <select
              value={category}
              onChange={e => {
                onCategoryChange(e.target.value);
                setView("all");
              }}
            >
              <option value="any">{t.categoryAll}</option>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </label>
        <label className="ev-filter">
          <span>{t.timeLabel}</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">📅</span>
            <select
              value={days}
              onChange={e => {
                onDaysChange(e.target.value);
                setView("all");
              }}
            >
              <option value="any">{t.timeAll}</option>
              <option value="0.25">{t.time6h}</option>
              <option value="1">{t.time24h}</option>
              <option value="2">{t.time48h}</option>
              <option value="7">{t.time7d}</option>
              <option value="30">{t.time30d}</option>
              <option value="90">{t.time90d}</option>
            </select>
          </div>
        </label>
        <label className="ev-filter">
          <span>{t.importanceLabel}</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">◆</span>
            <select
              value={importance}
              onChange={event => {
                setImportance(event.target.value);
                setView("all");
              }}
            >
              <option value="any">{t.importanceAll}</option>
              <option value="critical">{t.importanceCritical}</option>
              <option value="high">{t.importanceHigh}</option>
              <option value="medium">{t.importanceMedium}</option>
              <option value="low">{t.importanceLow}</option>
              <option value="info">{t.importanceInfo}</option>
            </select>
          </div>
        </label>
        <label className="ev-filter">
          <span>{t.opennessLabel}</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">◇</span>
            <select
              value={openness}
              onChange={event => {
                setOpenness(event.target.value);
                setView("all");
              }}
            >
              <option value="any">{t.opennessAll}</option>
              <option value="open_source">{t.opennessOpenSource}</option>
              <option value="open_weight">{t.opennessOpenWeight}</option>
              <option value="proprietary">{t.opennessProprietary}</option>
            </select>
          </div>
        </label>
        <label className="ev-filter">
          <span>{t.modelLevelLabel}</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">◈</span>
            <select
              value={modelLevel}
              onChange={event => {
                setModelLevel(event.target.value);
                setView("all");
              }}
            >
              <option value="any">{t.modelLevelAll}</option>
              <option value="frontier">{t.modelLevelFrontier}</option>
              <option value="advanced">{t.modelLevelHigh}</option>
              <option value="mid">{t.modelLevelMedium}</option>
            </select>
          </div>
        </label>
        <label className="ev-filter">
          <span>{t.sortLabel}</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">↕</span>
            <select value={sortBy} onChange={event => setSortBy(event.target.value as EventSort)}>
              <option value="importance">{t.sortImportance}</option>
              <option value="recent">{t.sortRecent}</option>
            </select>
          </div>
        </label>
        {(query
          || category !== "any"
          || days !== "any"
          || importance !== "any"
          || openness !== "any"
          || modelLevel !== "any"
          || sortBy !== "importance") && (
          <button
            type="button"
            className="ev-clear-filters"
            onClick={() => {
              setQuery("");
              setImportance("any");
              setOpenness("any");
              setModelLevel("any");
              setSortBy("importance");
              onCategoryChange("any");
              onDaysChange("any");
              setView("all");
            }}
          >
            {t.clearFilters}
          </button>
        )}
      </div>

      {featured && (() => {
        const org = organization(featured);
        const url = sourceUrl(featured);
        const summary = eventSummary(featured, language, locale);
        const tags = eventTags(featured);
        return (
          <div className="ev-featured-block">
            <p className="ev-block-label">{t.featured}</p>
            <article className="ev-featured">
              <div className={`ev-featured-media ev-${categoryClass(featured)}`}>
                <ModelAvatar
                  name={org.name}
                  companySlug={org.logoSlug}
                  companyName={org.name}
                  websiteUrl={org.websiteUrl}
                  fallbackSlugs={org.fallbackSlugs}
                  size="md"
                />
                <strong>{org.name}</strong>
              </div>
              <div className="ev-featured-body">
                <div className="ev-badges">
                  <span className={`ev-cat ev-${categoryClass(featured)}`}>{categoryLabel(featured)}</span>
                  <span className={`ev-score ${featured.importance}`}>
                    {scoreLabel(featured.importance, featured.importance_score)}
                  </span>
                </div>
                <h3>{cleanTitle(featured, language)}</h3>
                {summary && <p>{summary}</p>}
                {tags.length > 0 && (
                  <div className="ev-tags">
                    {tags.map(tag => <span key={tag}>{tag}</span>)}
                  </div>
                )}
              </div>
              <div className="ev-featured-side">
                <time>{relativeTime(featured.detected_at, language, locale)}</time>
                <small>
                  {new Date(featured.detected_at).toLocaleDateString(locale, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </small>
                <span>{t.sourcePrefix} {sourceLabel(featured)}</span>
                {url ? (
                  <a className="ev-detail-link" href={url} target="_blank" rel="noreferrer">
                    {t.viewDetails}
                  </a>
                ) : (
                  <span className="ev-detail-link muted">{t.noDetails}</span>
                )}
              </div>
            </article>
          </div>
        );
      })()}

      <div className="ev-section-head">
        <div className="ev-view-tabs" role="tablist" aria-label={t.viewAriaLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            className={view === "all" ? "active" : ""}
            onClick={() => setView("all")}
          >
            {t.recentTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "saved"}
            className={view === "saved" ? "active" : ""}
            onClick={() => setView("saved")}
          >
            {t.savedTab}
            {savedCount > 0 && <span className="ev-tab-count">{savedCount}</span>}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="ev-empty">{t.loading}</p>
      ) : rest.length ? (
        <div className="ev-grid">
          {rest.map(event => (
            <EventCard
              key={event.id}
              event={event}
              saved={Boolean(savedMap[event.id])}
              onToggleSave={() => handleToggleSave(event)}
            />
          ))}
        </div>
      ) : (
        <p className="ev-empty">
          {view === "saved"
            ? t.emptySaved
            : featured
              ? t.emptyOther
              : t.emptyFiltered}
        </p>
      )}

      {view === "all" && hasMore && (
        <div ref={sentinelRef} className="ev-scroll-sentinel" aria-hidden="true">
          {loadingMore ? <span>{t.loadingMore}</span> : null}
        </div>
      )}
    </section>
  );
}
