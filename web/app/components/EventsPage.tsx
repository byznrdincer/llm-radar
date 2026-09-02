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
  ["benchmark", "Benchmark"],
  ["research", "Research"],
  ["funding", "Funding"],
  ["product_launch", "Product Launch"],
  ["pricing_change", "Pricing Change"],
  ["api_update", "API Update"],
  ["infrastructure", "Infrastructure"],
  ["partnership", "Partnership"],
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

function cleanTitle(event: FeedEvent): string {
  let title = event.title || asString(event.new_value?.title) || "Başlıksız gelişme";

  title = title
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/^Research\s+/i, "")
    .replace(/\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b.*$/i, "")
    .replace(/\s+By\s+.+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  title = title
    .replace(" discovered", " yayımlandı")
    .replace(": context_window changed", " — context penceresi değişti")
    .replace(/: (input|output|cache_read)_per_1m_tokens changed/, " — token fiyatı değişti")
    .replace(": Arena rank changed", " — sıralaması değişti");

  if (title.length > 110) title = `${title.slice(0, 107).trim()}…`;
  return title;
}

function eventSummary(event: FeedEvent): string | null {
  const value = event.new_value ?? {};
  const org = organization(event).name;

  if (event.event_type === "model.released" || event.category === "model_release") {
    const bits: string[] = [];
    if (value.is_open_weight === true) bits.push("açık ağırlık");
    const license = asString(value.license);
    if (license) bits.push(license);
    const downloads = typeof value.downloads === "number" ? value.downloads : null;
    if (downloads != null && downloads > 0) {
      bits.push(`${new Intl.NumberFormat("tr-TR", { notation: "compact" }).format(downloads)} indirme`);
    }
    const pipeline = asString(value.pipeline_tag);
    if (pipeline) bits.push(pipeline.replaceAll("-", " "));
    if (bits.length) return `${org} · ${bits.join(" · ")}`;
    return `${org} tarafından yeni model yayımlandı.`;
  }
  if (event.event_type === "price.changed") {
    return event.change_percentage
      ? `Fiyat ${Number(event.change_percentage) > 0 ? "yükseldi" : "düştü"}: %${Math.abs(Number(event.change_percentage)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
      : "Yeni fiyat bilgisi kaydedildi.";
  }
  if (event.event_type === "leaderboard.changed" || event.category === "benchmark") {
    const before = Object.values(event.old_value ?? {})[0];
    const after = Object.values(event.new_value ?? {})[0];
    if (before != null && after != null) return `Sıra #${before} → #${after}`;
  }
  if (event.event_type === "company.announcement" || event.category === "research") {
    return `${sourceLabel(event)} kaynaklı duyuru`;
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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Dün";
  if (days < 7) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
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

type EventCardProps = {
  event: FeedEvent;
  saved: boolean;
  onToggleSave: () => void;
};

function EventCard({ event, saved, onToggleSave }: EventCardProps) {
  const org = organization(event);
  const url = sourceUrl(event);
  const summary = eventSummary(event);

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
      <h4>{cleanTitle(event)}</h4>
      {summary && <p>{summary}</p>}
      <footer>
        <span className="ev-card-meta">
          <strong>{sourceLabel(event)}</strong>
          <span aria-hidden="true">•</span>
          <time>{relativeTime(event.detected_at)}</time>
        </span>
        <div className="ev-card-actions">
          {url && (
            <a href={url} target="_blank" rel="noreferrer" aria-label="Kaynağı aç">↗</a>
          )}
          <button
            type="button"
            className={saved ? "on" : ""}
            aria-label={saved ? "Kaydı kaldır" : "Kaydet"}
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

export default function EventsPage({
  api,
  category,
  days,
  onCategoryChange,
  onDaysChange,
}: Props) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [savedMap, setSavedMap] = useState<Record<string, SavedEventRecord>>({});
  const [view, setView] = useState<"all" | "saved">("all");
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setSavedMap(loadSavedEvents());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setEvents([]);
    setTotal(0);
    setNextOffset(0);

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: "0",
      sort_by: "importance",
    });
    if (category !== "any") params.set("category", category);
    if (days !== "any") params.set("since", daysAgoIso(Number(days)));

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
  }, [api, category, days]);

  useEffect(() => {
    const stream = new EventSource(`${api}/api/v1/stream/events`);
    stream.addEventListener("change", ev => {
      try {
        const incoming = JSON.parse(ev.data) as FeedEvent;
        if (isJunkEvent(incoming)) return;
        setEvents(current => {
          if (current.some(event => event.id === incoming.id)) return current;
          return [incoming, ...current];
        });
        setTotal(current => current + 1);
      } catch {
        /* ignore malformed payloads */
      }
    });
    return () => stream.close();
  }, [api]);

  const savedCount = Object.keys(savedMap).length;
  const savedEvents = useMemo(() => savedEventList(savedMap).map(record => record.event), [savedMap]);

  const featured = view === "all" ? events[0] ?? null : null;
  const rest = useMemo(
    () => (view === "all" ? events.slice(1) : savedEvents),
    [events, savedEvents, view],
  );
  const hasMore = view === "all" && nextOffset < total && !loading;

  const loadMore = () => {
    if (!hasMore || loadingMoreRef.current || loadingMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
      sort_by: "importance",
    });
    if (category !== "any") params.set("category", category);
    if (days !== "any") params.set("since", daysAgoIso(Number(days)));

    fetch(`${api}/api/v1/events?${params}`)
      .then(response => {
        if (!response.ok) throw new Error("events");
        return response.json();
      })
      .then(data => {
        const raw = (data.items ?? []) as FeedEvent[];
        setEvents(current => {
          const seen = new Set(current.map(event => event.id));
          return [...current, ...raw.filter(event => !isJunkEvent(event) && !seen.has(event.id))];
        });
        if (typeof data.total === "number") setTotal(data.total);
        setNextOffset(Number(data.offset ?? nextOffset) + Number(data.limit ?? PAGE_SIZE));
      })
      .catch(() => { /* keep current page */ })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  };

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && view === "all");

  const handleToggleSave = (event: FeedEvent) => {
    setSavedMap(current => toggleSavedEvent(event, current));
  };

  return (
    <section className="ev-page" id="events">
      <header className="ev-hero">
        <div className="ev-hero-copy">
          <h2>Teknoloji gelişmeleri</h2>
          <p className="ev-subtitle">AI ekosistemindeki önemli değişiklikleri takip et.</p>
        </div>
        <button type="button" className="ev-method-btn" onClick={() => setMethodOpen(open => !open)}>
          <span aria-hidden="true">ⓘ</span> Skorlama metodolojisi
        </button>
      </header>

      {methodOpen && (
        <p className="ev-method-note">
          Gelişmeler kaynak güvenilirliği, değişimin büyüklüğü, sektörel etki ve doğrulama durumuyla 0–100 puanlanır.
        </p>
      )}

      <div className="ev-filters">
        <label className="ev-filter">
          <span>Kategori</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">▦</span>
            <select
              value={category}
              onChange={e => {
                onCategoryChange(e.target.value);
                setView("all");
              }}
            >
              <option value="any">Tümü</option>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </label>
        <label className="ev-filter">
          <span>Zaman</span>
          <div className="ev-select-wrap">
            <span className="ev-select-icon" aria-hidden="true">📅</span>
            <select
              value={days}
              onChange={e => {
                onDaysChange(e.target.value);
                setView("all");
              }}
            >
              <option value="any">Tüm zamanlar</option>
              <option value="1">Son 24 saat</option>
              <option value="7">Son 7 gün</option>
              <option value="30">Son 30 gün</option>
              <option value="90">Son 90 gün</option>
            </select>
          </div>
        </label>
      </div>

      {featured && (() => {
        const org = organization(featured);
        const url = sourceUrl(featured);
        const summary = eventSummary(featured);
        const tags = eventTags(featured);
        return (
          <div className="ev-featured-block">
            <p className="ev-block-label">Öne çıkan</p>
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
                <h3>{cleanTitle(featured)}</h3>
                {summary && <p>{summary}</p>}
                {tags.length > 0 && (
                  <div className="ev-tags">
                    {tags.map(tag => <span key={tag}>{tag}</span>)}
                  </div>
                )}
              </div>
              <div className="ev-featured-side">
                <time>{relativeTime(featured.detected_at)}</time>
                <small>
                  {new Date(featured.detected_at).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </small>
                <span>Kaynak: {sourceLabel(featured)}</span>
                {url ? (
                  <a className="ev-detail-link" href={url} target="_blank" rel="noreferrer">
                    Detayı gör →
                  </a>
                ) : (
                  <span className="ev-detail-link muted">Detay yok</span>
                )}
              </div>
            </article>
          </div>
        );
      })()}

      <div className="ev-section-head">
        <div className="ev-view-tabs" role="tablist" aria-label="Gelişme görünümü">
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            className={view === "all" ? "active" : ""}
            onClick={() => setView("all")}
          >
            Son gelişmeler
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "saved"}
            className={view === "saved" ? "active" : ""}
            onClick={() => setView("saved")}
          >
            Kaydedilenler
            {savedCount > 0 && <span className="ev-tab-count">{savedCount}</span>}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="ev-empty">Gelişmeler yükleniyor…</p>
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
            ? "Henüz kaydedilmiş gelişme yok. Kartlardaki yer imine tıklayarak kaydedebilirsin."
            : featured
              ? "Başka gelişme yok."
              : "Bu filtrelerle gelişme bulunamadı."}
        </p>
      )}

      {view === "all" && hasMore && (
        <div ref={sentinelRef} className="ev-scroll-sentinel" aria-hidden="true">
          {loadingMore ? <span>Daha fazla yükleniyor…</span> : null}
        </div>
      )}
    </section>
  );
}

