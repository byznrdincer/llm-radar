"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage, type Language } from "../lib/i18n";

export type ResearchItem = {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  published_at: string | null;
  observed_at?: string | null;
  url: string;
  categories: string[];
};

type ResearchSummary = {
  added_today: number;
  added_yesterday: number;
  primary_source_pct: number;
  verified_week: number;
};

export type ResearchBootstrap = {
  items: ResearchItem[];
  total: number;
  summary: ResearchSummary | null;
  limit: number;
};

type Props = {
  api: string;
  bootstrap?: ResearchBootstrap | null;
};

const PAGE_SIZE = 16;

const SOURCE_OPTIONS: Record<Language, [string, string][]> = {
  tr: [
    ["any", "Tüm kaynaklar"],
    ["arxiv", "arXiv"],
  ],
  en: [
    ["any", "All sources"],
    ["arxiv", "arXiv"],
  ],
};

const TYPE_OPTIONS: Record<Language, [string, string][]> = {
  tr: [
    ["any", "Tüm türler"],
    ["cs.AI", "Yapay zeka (cs.AI)"],
    ["cs.CL", "Doğal dil (cs.CL)"],
    ["cs.LG", "Makine öğrenmesi (cs.LG)"],
    ["cs.CV", "Bilgisayarlı görü (cs.CV)"],
    ["cs.RO", "Robotik (cs.RO)"],
  ],
  en: [
    ["any", "All types"],
    ["cs.AI", "Artificial Intelligence (cs.AI)"],
    ["cs.CL", "Natural Language (cs.CL)"],
    ["cs.LG", "Machine Learning (cs.LG)"],
    ["cs.CV", "Computer Vision (cs.CV)"],
    ["cs.RO", "Robotics (cs.RO)"],
  ],
};

const IMPORTANCE_OPTIONS: Record<Language, [string, string][]> = {
  tr: [
    ["any", "Tüm önem"],
    ["high", "Yüksek"],
    ["medium", "Orta"],
    ["low", "Düşük"],
  ],
  en: [
    ["any", "All importance"],
    ["high", "High"],
    ["medium", "Medium"],
    ["low", "Low"],
  ],
};

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function paperSource(item: ResearchItem, language: Language): string {
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, "");
    if (host.includes("arxiv.org")) return "arXiv";
    return host.split(".")[0]?.replace(/^./, c => c.toUpperCase()) ?? (language === "tr" ? "Kaynak" : "Source");
  } catch {
    return language === "tr" ? "Kaynak" : "Source";
  }
}

function importanceLevel(item: ResearchItem): "high" | "medium" | "low" {
  const anchor = item.published_at ?? item.observed_at;
  if (!anchor) return "medium";
  const date = new Date(anchor);
  if (Number.isNaN(date.getTime())) return "medium";
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (days <= 7) return "high";
  if (days <= 30) return "medium";
  return "low";
}

function importanceLabel(level: "high" | "medium" | "low", language: Language): string {
  if (level === "high") return language === "tr" ? "Yüksek" : "High";
  if (level === "medium") return language === "tr" ? "Orta" : "Medium";
  return language === "tr" ? "Düşük" : "Low";
}

function canOpenUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const value = url.toLowerCase();
    return value.startsWith("http://") || value.startsWith("https://");
  } catch {
    return false;
  }
}

function authorLine(authors: string[], language: Language): string {
  const list = (authors || []).filter(Boolean);
  if (!list.length) return language === "tr" ? "Yazar belirtilmedi" : "No authors listed";
  if (list.length <= 3) return list.join(", ");
  return `${list.slice(0, 3).join(", ")} +${list.length - 3}`;
}

function truncate(text: string | null | undefined, max = 220): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function ImportancePill({ level }: { level: "high" | "medium" | "low" }) {
  const { language } = useLanguage();
  return <span className={`rs-pill ${level}`}>{importanceLabel(level, language)}</span>;
}

function StatIcon({ kind }: { kind: "today" | "source" | "verified" }) {
  if (kind === "today") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h2v2h6V3h2v2h3a1 1 0 0 1 1 1v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h3V3Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 10h14" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (kind === "source") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 4 6v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V6l-8-3Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m9.5 12 1.8 1.8L15 10.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PaperCard({ item }: { item: ResearchItem }) {
  const { language, locale } = useLanguage();
  const level = importanceLevel(item);

  return (
    <article className="rs-card">
      <p className="rs-card-kicker">{language === "tr" ? "Araştırma" : "Research"}</p>
      <h3>{item.title}</h3>
      <p className="rs-authors">{authorLine(item.authors, language)}</p>
      <footer>
        <span className="rs-card-source">{paperSource(item, language)}</span>
        <time dateTime={item.published_at ?? undefined}>{formatDate(item.published_at, locale)}</time>
        <ImportancePill level={level} />
      </footer>
    </article>
  );
}

function FeaturedPaper({ item }: { item: ResearchItem }) {
  const { language, locale } = useLanguage();
  const level = importanceLevel(item);
  const href = canOpenUrl(item.url) ? item.url : null;

  return (
    <article className="rs-featured">
      <div className="rs-featured-body">
        <p className="rs-featured-kicker">{language === "tr" ? "Öne çıkan araştırma" : "Featured research"}</p>
        <h3>{item.title}</h3>
        {item.abstract && <p className="rs-featured-abstract">{truncate(item.abstract, 260)}</p>}
        <p className="rs-authors">
          <span className="rs-author-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16"><circle cx="8" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M3 14c0-3 2.2-5 5-5s5 2 5 5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          </span>
          {authorLine(item.authors, language)}
        </p>
        <div className="rs-featured-footer">
          <div className="rs-featured-tags">
            <span className="rs-tag">{language === "tr" ? "Kaynak" : "Source"}: {paperSource(item, language)}</span>
            <span className="rs-tag">{language === "tr" ? "Tarih" : "Date"}: {formatDate(item.published_at, locale)}</span>
            <span className="rs-tag">
              {language === "tr" ? "Önem" : "Importance"}: <ImportancePill level={level} />
            </span>
          </div>
          {href && (
            <a className="rs-source-link" href={href} target="_blank" rel="noreferrer">
              {language === "tr" ? "Kaynağı aç ↗" : "View source ↗"}
            </a>
          )}
        </div>
      </div>
      <div className="rs-featured-art" aria-hidden="true">
        <svg viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 140 C35 95, 75 155, 115 115 S195 75, 240 55" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
          <path d="M0 110 C45 70, 85 130, 130 90 S210 45, 240 25" stroke="currentColor" strokeWidth="1.1" opacity="0.28" />
          <path d="M0 80 C55 40, 95 100, 145 60 S220 15, 240 0" stroke="currentColor" strokeWidth="1.1" opacity="0.22" />
          <path d="M20 170 C60 130, 100 160, 170 120" stroke="currentColor" strokeWidth="1.1" opacity="0.18" />
          <path d="M40 40 L200 150 M200 40 L40 150" stroke="currentColor" strokeWidth="0.8" opacity="0.08" />
          <circle cx="175" cy="52" r="34" stroke="currentColor" strokeWidth="1" opacity="0.16" />
          <circle cx="175" cy="52" r="18" stroke="currentColor" strokeWidth="1" opacity="0.1" />
        </svg>
      </div>
    </article>
  );
}

export default function ResearchPage({ api, bootstrap = null }: Props) {
  const { language, locale } = useLanguage();
  const bootReady = bootstrap !== null && bootstrap.items.length > 0;
  const [items, setItems] = useState<ResearchItem[]>(() => bootstrap?.items ?? []);
  const [total, setTotal] = useState(() => bootstrap?.total ?? 0);
  const [nextOffset, setNextOffset] = useState(() => bootstrap?.limit ?? PAGE_SIZE);
  const [summary, setSummary] = useState<ResearchSummary | null>(() => bootstrap?.summary ?? null);
  const [loading, setLoading] = useState(!bootReady);
  const [loadingMore, setLoadingMore] = useState(false);
  const [source, setSource] = useState("any");
  const [type, setType] = useState("any");
  const [importance, setImportance] = useState("any");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const loadingMoreRef = useRef(false);
  const skipInitialFetchRef = useRef(bootReady);

  useEffect(() => {
    if (!bootstrap?.items.length || source !== "any" || type !== "any" || query) return;
    setItems(bootstrap.items);
    setTotal(bootstrap.total);
    setSummary(bootstrap.summary);
    setNextOffset(bootstrap.limit);
    setLoading(false);
    skipInitialFetchRef.current = true;
  }, [bootstrap, source, type, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (skipInitialFetchRef.current && source === "any" && type === "any" && !query) {
      skipInitialFetchRef.current = false;
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    setTotal(0);
    setNextOffset(0);

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: "0",
    });
    if (source !== "any") params.set("source", source);
    if (type !== "any") params.set("category", type);
    if (query) params.set("q", query);

    fetch(`${api}/api/v1/research?${params}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("research");
        return response.json();
      })
      .then(data => {
        setItems(data.items ?? []);
        setTotal(Number(data.total ?? 0));
        setSummary(data.summary ?? null);
        setNextOffset(Number(data.offset ?? 0) + Number(data.limit ?? PAGE_SIZE));
      })
      .catch(error => {
        if (error.name !== "AbortError") setItems([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [api, source, type, query]);

  const filtered = useMemo(() => {
    if (importance === "any") return items;
    return items.filter(item => importanceLevel(item) === importance);
  }, [items, importance]);

  const featured = filtered[0] ?? null;
  const rest = filtered.slice(1);
  const hasMore = nextOffset < total && !loading;

  const loadMore = () => {
    if (!hasMore || loadingMoreRef.current || loadingMore || importance !== "any") return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    if (source !== "any") params.set("source", source);
    if (type !== "any") params.set("category", type);
    if (query) params.set("q", query);

    fetch(`${api}/api/v1/research?${params}`)
      .then(response => {
        if (!response.ok) throw new Error("research");
        return response.json();
      })
      .then(data => {
        const incoming = (data.items ?? []) as ResearchItem[];
        setItems(current => {
          const seen = new Set(current.map(item => item.id));
          return [...current, ...incoming.filter(item => !seen.has(item.id))];
        });
        if (typeof data.total === "number") setTotal(data.total);
        if (data.summary) setSummary(data.summary);
        setNextOffset(Number(data.offset ?? nextOffset) + Number(data.limit ?? PAGE_SIZE));
      })
      .catch(() => { /* keep current page */ })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  };

  const todayDelta = summary ? summary.added_today - summary.added_yesterday : 0;
  const todayDeltaLabel = todayDelta > 0
    ? (language === "tr" ? `+${todayDelta} dünden` : `+${todayDelta} from yesterday`)
    : todayDelta < 0
      ? (language === "tr" ? `${todayDelta} dünden` : `${todayDelta} from yesterday`)
      : (language === "tr" ? "Dünle aynı" : "Same as yesterday");

  return (
    <section className="rs-page" id="research">
      <span className="rs-live">
        <span className="rs-live-dot" aria-hidden="true" />
        {language === "tr" ? "Canlı" : "Live"}
      </span>

      <header className="rs-hero">
        <div className="rs-hero-copy">
          <p className="rs-kicker">{language === "tr" ? "İstihbarat" : "Intelligence"}</p>
          <h2>{language === "tr" ? "Araştırma akışı" : "Research feed"}</h2>
          <p className="rs-subtitle">
            {language === "tr"
              ? "Akademik makaleler, uyarılar, teknik raporlar ve doğrulanmış kaynakları takip edin."
              : "Track academic papers, alerts, technical reports, and verified sources."}
          </p>
        </div>
        <div className="rs-stats">
          <article className="rs-stat">
            <span className="rs-stat-icon"><StatIcon kind="today" /></span>
            <div>
              <span>{language === "tr" ? "Bugün eklenen" : "Added today"}</span>
              <strong>{summary?.added_today ?? "—"}</strong>
              <small>{summary ? todayDeltaLabel : "—"}</small>
            </div>
          </article>
          <article className="rs-stat">
            <span className="rs-stat-icon"><StatIcon kind="source" /></span>
            <div>
              <span>Primary source</span>
              <strong>{summary ? (language === "tr" ? `%${summary.primary_source_pct}` : `${summary.primary_source_pct}%`) : "—"}</strong>
              <small>{language === "tr" ? "Yüksek güven" : "High confidence"}</small>
            </div>
          </article>
          <article className="rs-stat">
            <span className="rs-stat-icon"><StatIcon kind="verified" /></span>
            <div>
              <span>{language === "tr" ? "Doğrulandı" : "Verified"}</span>
              <strong>{summary?.verified_week ?? "—"}</strong>
              <small>{language === "tr" ? "Bu hafta" : "This week"}</small>
            </div>
          </article>
        </div>
      </header>

      <div className="rs-toolbar">
        <div className="rs-filters">
          <label className="rs-filter">
            <span>{language === "tr" ? "Kaynak" : "Source"}</span>
            <div className="rs-select-wrap">
              <span className="rs-select-icon" aria-hidden="true">▦</span>
              <select value={source} onChange={e => setSource(e.target.value)}>
                {SOURCE_OPTIONS[language].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </label>
          <label className="rs-filter">
            <span>{language === "tr" ? "Tür" : "Type"}</span>
            <div className="rs-select-wrap">
              <span className="rs-select-icon" aria-hidden="true">◫</span>
              <select value={type} onChange={e => setType(e.target.value)}>
                {TYPE_OPTIONS[language].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </label>
          <label className="rs-filter">
            <span>{language === "tr" ? "Önem" : "Importance"}</span>
            <div className="rs-select-wrap">
              <span className="rs-select-icon" aria-hidden="true">◎</span>
              <select value={importance} onChange={e => setImportance(e.target.value)}>
                {IMPORTANCE_OPTIONS[language].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <label className="rs-search">
          <span className="rs-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={language === "tr" ? "Araştırmalarda ara..." : "Search research..."}
            aria-label={language === "tr" ? "Araştırmalarda ara" : "Search research"}
          />
        </label>
      </div>

      {loading ? (
        <p className="rs-empty">{language === "tr" ? "Araştırmalar yükleniyor…" : "Loading research…"}</p>
      ) : filtered.length === 0 ? (
        <p className="rs-empty">
          {language === "tr"
            ? "Henüz eşleşen araştırma yok. arXiv collector çalışınca burada görünür."
            : "No matching research yet. It will appear here once the arXiv collector runs."}
        </p>
      ) : (
        <>
          {featured && (
            <div className="rs-featured-block">
              <FeaturedPaper item={featured} />
            </div>
          )}
          <div className="rs-grid">
            {rest.map(item => (
              <PaperCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {!loading && hasMore && importance === "any" && (
        <button type="button" className="rs-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? (language === "tr" ? "Yükleniyor…" : "Loading…") : (language === "tr" ? "Daha fazla araştırma yükle" : "Load more research")}
          <span aria-hidden="true">⌄</span>
        </button>
      )}
    </section>
  );
}
