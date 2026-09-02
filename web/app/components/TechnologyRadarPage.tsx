"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACCENT_COLORS,
  FEATURED_SLUGS,
  GRID_SLUGS,
  TECHNOLOGY_COPY,
  countMatchingEvents,
  eventMatchesSlug,
  growthPercent,
  relatedBrandsFromEvents,
  trendLabel,
  trendStatus,
  type TechnologyAccent,
  type TechnologySlug,
} from "../lib/technologyContent";
import { toPublicSourceUrl } from "../lib/publicSourceUrl";

type TechnologySignal = {
  slug: string;
  name: string;
  last_seen_at: string;
  evidence: Record<string, unknown>;
};

type FeedEvent = {
  id: string;
  title: string;
  detected_at: string;
  new_value?: Record<string, unknown> | null;
  evidence?: {
    source?: string;
    source_url?: string;
  } | null;
};

type ResearchItem = {
  id: string;
  title: string;
  url: string;
  published_at: string | null;
};

type Props = {
  api: string;
  signals?: TechnologySignal[];
  onViewAllEvents?: () => void;
};

type DayRange = 7 | 30 | 90;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function eventSourceUrl(event: FeedEvent): string | null {
  const raw = event.evidence?.source_url ?? null;
  if (!raw) return null;
  return toPublicSourceUrl(raw, { sourceSlug: event.evidence?.source ?? null });
}

function TechIcon({ slug, accent }: { slug: TechnologySlug; accent: TechnologyAccent }) {
  const colors = ACCENT_COLORS[accent];
  const common = { width: 22, height: 22, stroke: colors.main, strokeWidth: 1.8, fill: "none" };

  if (slug === "mcp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M8 8h8v8H8z" />
        <path {...common} d="M12 8V4M12 20v-4M8 12H4M20 12h-4" />
      </svg>
    );
  }
  if (slug === "agent") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="8" r="3" />
        <path {...common} d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path {...common} d="M16 6l2-2M8 6L6 4" />
      </svg>
    );
  }
  if (slug === "context_compaction") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 8h16M4 12h10M4 16h6" />
        <path {...common} d="M18 14l3-2-3-2" />
      </svg>
    );
  }
  if (slug === "moe") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="8" cy="8" r="2.5" />
        <circle {...common} cx="16" cy="8" r="2.5" />
        <circle {...common} cx="12" cy="16" r="2.5" />
        <path {...common} d="M9.5 9.5 11 13M14.5 9.5 13 13" />
      </svg>
    );
  }
  if (slug === "reasoning") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z" />
        <path {...common} d="M10 20h4" />
      </svg>
    );
  }
  if (slug === "computer_use") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="3" y="4" width="18" height="12" rx="2" />
        <path {...common} d="M8 20h8M12 16v4" />
      </svg>
    );
  }
  if (slug === "model_routing") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 6h6v4H4zM14 14h6v4h-6z" />
        <path {...common} d="M10 8h4M10 16h4M14 8l4 6" />
      </svg>
    );
  }
  if (slug === "multimodal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="3" y="5" width="14" height="10" rx="2" />
        <path {...common} d="M8 19h12M14 15v4" />
      </svg>
    );
  }
  if (slug === "open_weights") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3 4 7v6c0 4 3.5 7 8 8 4.5-1 8-4 8-8V7l-8-4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...common} cx="12" cy="12" r="8" />
    </svg>
  );
}

function useTechMetrics(events: FeedEvent[], slug: TechnologySlug, days: DayRange, signal?: TechnologySignal) {
  return useMemo(() => {
    const eventTimes = events
      .map(event => new Date(event.detected_at).getTime())
      .filter(Number.isFinite);
    const signalTime = signal?.last_seen_at ? new Date(signal.last_seen_at).getTime() : 0;
    const now = Math.max(signalTime, ...eventTimes, 0);
    const rangeMs = days * 86_400_000;
    const sinceMs = now - rangeMs;
    const prevSinceMs = now - rangeMs * 2;

    const current = now ? countMatchingEvents(events, slug, sinceMs, now) : 0;
    const previous = now ? countMatchingEvents(events, slug, prevSinceMs, sinceMs) : 0;
    const growth = growthPercent(current, previous);
    const status = trendStatus(growth);
    const lastSeen = signal?.last_seen_at ?? null;

    return { current, previous, growth, status, lastSeen };
  }, [events, slug, days, signal]);
}

export default function TechnologyRadarPage({ api, signals = [], onViewAllEvents }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [selected, setSelected] = useState<TechnologySlug | null>(null);
  const [researchResult, setResearchResult] = useState<{ slug: TechnologySlug | null; items: ResearchItem[] }>({
    slug: null,
    items: [],
  });
  const [days, setDays] = useState<DayRange>(30);
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    fetch(`${api}/api/v1/events?since=${encodeURIComponent(since)}&sort_by=recent&limit=200`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setEvents(data?.items ?? []))
      .catch(() => setEvents([]));
  }, [api]);

  useEffect(() => {
    if (!selected) return;
    let ignore = false;
    const copy = TECHNOLOGY_COPY[selected];
    fetch(`${api}/api/v1/research?q=${encodeURIComponent(copy.researchQuery)}&limit=3`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!ignore) setResearchResult({ slug: selected, items: data?.items ?? [] });
      })
      .catch(() => {
        if (!ignore) setResearchResult({ slug: selected, items: [] });
      });
    return () => { ignore = true; };
  }, [api, selected]);

  const papers = researchResult.slug === selected ? researchResult.items : [];
  const papersLoading = Boolean(selected && researchResult.slug !== selected);

  const signalBySlug = useMemo(() => {
    const map = new Map<string, TechnologySignal>();
    for (const item of signals) map.set(item.slug, item);
    return map;
  }, [signals]);

  const detailEvents = useMemo(() => {
    if (!selected) return [];
    return events.filter(e => eventMatchesSlug(e, selected)).slice(0, 12);
  }, [events, selected]);

  if (selected) {
    return (
      <TechnologyDetail
        slug={selected}
        days={days}
        events={events}
        signal={signalBySlug.get(selected)}
        detailEvents={detailEvents}
        papers={papers}
        papersLoading={papersLoading}
        onBack={() => setSelected(null)}
        onViewAllEvents={onViewAllEvents}
      />
    );
  }

  return (
    <section className="tr-page tr-page-dark" id="radar">
      <header className="tr-hero">
        <div className="tr-hero-copy">
          <p className="tr-eyebrow">TEKNOLOJİ RADARI</p>
          <h2>Yükselen teknolojileri takip et.</h2>
          <p className="tr-subtitle">
            LLM ekosistemindeki önemli hareketleri tek bakışta görün.
          </p>
        </div>
        <div className="tr-hero-tools">
          <div className="tr-range-tabs" role="tablist" aria-label="Zaman aralığı">
            {([7, 30, 90] as DayRange[]).map(value => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={days === value}
                className={days === value ? "active" : ""}
                onClick={() => setDays(value)}
              >
                {value} gün
              </button>
            ))}
          </div>
          <button type="button" className="tr-method-link" onClick={() => setMethodOpen(true)}>
            Metodoloji
          </button>
        </div>
      </header>

      <section className="tr-section">
        <div className="tr-section-title">
          <h3>Öne çıkanlar</h3>
          <p>Seçili dönemin en görünür teknoloji sinyalleri</p>
        </div>
        <div className="tr-featured-row">
          {FEATURED_SLUGS.map(slug => (
            <FeaturedCard
              key={slug}
              slug={slug}
              days={days}
              events={events}
              signal={signalBySlug.get(slug)}
              onOpen={() => setSelected(slug)}
            />
          ))}
        </div>
      </section>

      <section className="tr-section">
        <div className="tr-section-head">
          <div className="tr-section-title">
            <h3>Tüm teknolojiler</h3>
            <p>{days} günlük gelişme özeti</p>
          </div>
        </div>

        <div className="tr-tech-grid">
          {GRID_SLUGS.map(slug => (
            <TechnologyListCard
              key={slug}
              slug={slug}
              days={days}
              events={events}
              signal={signalBySlug.get(slug)}
              onOpen={() => setSelected(slug)}
            />
          ))}
        </div>
      </section>

      {onViewAllEvents && (
        <footer className="tr-foot-cta">
          <button type="button" onClick={onViewAllEvents}>
            Tüm teknolojileri ve gelişmeleri keşfet →
          </button>
        </footer>
      )}

      {methodOpen && (
        <div className="tr-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setMethodOpen(false); }}>
          <div className="tr-modal" role="dialog" aria-modal="true">
            <button type="button" className="tr-modal-close" onClick={() => setMethodOpen(false)}>×</button>
            <h3>Skorlama metodolojisi</h3>
            <p>
              Teknoloji Radarı, GitHub sürümleri, araştırma metinleri ve resmî duyurulardan gelen gelişmeleri
              anahtar kelime eşleştirmesiyle gruplar. Yükseliş oranı, seçili dönemdeki gelişme sayısının bir
              önceki eşit döneme göre değişimini gösterir.
            </p>
            <p className="tr-muted">
              Veriler uydurulmaz; yalnızca kayıtlı ve teknolojiyle eşleşen gelişmeler sayılır.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

type CardProps = {
  slug: TechnologySlug;
  days: DayRange;
  events: FeedEvent[];
  signal?: TechnologySignal;
  onOpen: () => void;
};

type DetailProps = {
  slug: TechnologySlug;
  days: DayRange;
  events: FeedEvent[];
  signal?: TechnologySignal;
  detailEvents: FeedEvent[];
  papers: ResearchItem[];
  papersLoading: boolean;
  onBack: () => void;
  onViewAllEvents?: () => void;
};

function TechnologyDetail({
  slug,
  days,
  events,
  signal,
  detailEvents,
  papers,
  papersLoading,
  onBack,
  onViewAllEvents,
}: DetailProps) {
  const copy = TECHNOLOGY_COPY[slug];
  const metrics = useTechMetrics(events, slug, days, signal);
  const brands = relatedBrandsFromEvents(events, slug);
  const colors = ACCENT_COLORS[copy.accent];

  return (
    <section className="tr-page tr-page-dark" id="radar">
      <button type="button" className="tr-back" onClick={onBack}>
        ← Teknoloji Radarı
      </button>

      <header className="tr-detail-hero">
        <div className="tr-detail-icon" style={{ background: colors.soft, borderColor: colors.glow }}>
          <TechIcon slug={slug} accent={copy.accent} />
        </div>
        <div>
          <p className="tr-detail-kicker">{copy.subtitle}</p>
          <h2>{copy.title}</h2>
          <div className="tr-detail-meta">
            <span className={`tr-trend tr-trend-${metrics.status}`}>{trendLabel(metrics.status)}</span>
            <span>{metrics.current} gelişme ({days} gün)</span>
            {metrics.growth !== 0 && (
              <span className={metrics.growth > 0 ? "tr-up" : "tr-down"}>
                {metrics.growth > 0 ? "+" : ""}{metrics.growth}%
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="tr-detail-grid">
        <article className="tr-detail-block">
          <h3>{copy.title} nedir?</h3>
          <p>{copy.whatIs}</p>
        </article>

        <article className="tr-detail-block">
          <h3>Neden takip ediyoruz?</h3>
          <p>{copy.whyTrack}</p>
        </article>

        <article className="tr-detail-block tr-detail-wide">
          <div className="tr-detail-head">
            <h3>Son gelişmeler</h3>
            {onViewAllEvents && (
              <button type="button" className="tr-link-btn" onClick={onViewAllEvents}>
                Tüm gelişmeler →
              </button>
            )}
          </div>
          {detailEvents.length ? (
            <ul className="tr-dev-list">
              {detailEvents.map(event => {
                const url = eventSourceUrl(event);
                return (
                  <li key={event.id}>
                    <div>
                      <strong>{event.title}</strong>
                      <time>{formatDate(event.detected_at)}</time>
                    </div>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" aria-label="Kaynağı aç">↗</a>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tr-muted">{copy.latestDevelopment}</p>
          )}
        </article>

        <article className="tr-detail-block">
          <h3>İlgili modeller</h3>
          <div className="tr-brand-row">
            {brands.map(name => (
              <span key={name} className="tr-brand-chip">{name}</span>
            ))}
          </div>
        </article>

        <article className="tr-detail-block">
          <h3>İlgili araştırmalar</h3>
          {papersLoading ? (
            <p className="tr-muted">Yükleniyor…</p>
          ) : papers.length ? (
            <ul className="tr-paper-list">
              {papers.map(paper => (
                <li key={paper.id}>
                  <a href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a>
                  <time>{formatDate(paper.published_at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tr-muted">Henüz eşleşen makale yok.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function FeaturedCard({ slug, days, events, signal, onOpen }: CardProps) {
  const copy = TECHNOLOGY_COPY[slug];
  const colors = ACCENT_COLORS[copy.accent];
  const metrics = useTechMetrics(events, slug, days, signal);

  return (
    <article className="tr-featured-card" style={{ ["--tr-accent" as string]: colors.main, ["--tr-accent-soft" as string]: colors.soft }}>
      <button type="button" className="tr-card-hit" onClick={onOpen} aria-label={`${copy.title} detayını aç`} />
      <div className="tr-featured-main">
        <div className="tr-icon-wrap" style={{ background: colors.soft, borderColor: colors.glow }}>
          <TechIcon slug={slug} accent={copy.accent} />
        </div>
        <div className="tr-featured-copy">
          <div className="tr-featured-title-row">
            <h4>{copy.title}</h4>
            <span className="tr-card-arrow">›</span>
          </div>
          <p className="tr-featured-desc">{copy.shortDescription}</p>
        </div>
      </div>
      <footer className="tr-card-metrics">
        <span><strong>{metrics.current}</strong> gelişme <small>· {days} gün</small></span>
        <span className={`tr-trend tr-trend-${metrics.status}`}>
          {metrics.status === "rising" ? "↗" : metrics.status === "falling" ? "↘" : "→"} {trendLabel(metrics.status)}
        </span>
      </footer>
    </article>
  );
}

function TechnologyListCard({ slug, days, events, signal, onOpen }: CardProps) {
  const copy = TECHNOLOGY_COPY[slug];
  const colors = ACCENT_COLORS[copy.accent];
  const metrics = useTechMetrics(events, slug, days, signal);

  return (
    <article className="tr-compact-card" style={{ ["--tr-accent" as string]: colors.main, ["--tr-accent-soft" as string]: colors.soft }}>
      <button type="button" className="tr-card-hit" onClick={onOpen} aria-label={`${copy.title} detayını aç`} />
      <div className="tr-icon-wrap sm" style={{ background: colors.soft, borderColor: colors.glow }}>
        <TechIcon slug={slug} accent={copy.accent} />
      </div>
      <div className="tr-compact-copy">
        <h4>{copy.title}</h4>
        <p>{copy.shortDescription}</p>
      </div>
      <div className="tr-compact-meta">
        <span className={`tr-trend tr-trend-${metrics.status}`}>
          {metrics.status === "rising" ? "↗" : metrics.status === "falling" ? "↘" : "→"} {trendLabel(metrics.status)}
        </span>
        <strong>{metrics.current}<small> gelişme</small></strong>
      </div>
      <span className="tr-card-arrow">›</span>
    </article>
  );
}
