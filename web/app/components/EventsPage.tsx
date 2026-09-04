"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModelAvatar from "./ModelAvatar";
import EventCard from "./EventCard";
import {
  loadSavedEvents,
  savedEventList,
  toggleSavedEvent,
  type SavedEventRecord,
} from "../lib/savedEvents";
import { useInfiniteScroll } from "../lib/useInfiniteScroll";
import { useLanguage } from "../lib/i18n";
import { STRINGS } from "../lib/eventsContent";
import {
  categoryClass,
  categoryLabel,
  cleanTitle,
  CATEGORY_OPTIONS,
  eventSummary,
  eventTags,
  isJunkEvent,
  modelLevelLabel,
  organization,
  relativeTime,
  scoreLabel,
  sourceLabel,
  sourceUrl,
} from "../lib/eventPresentation";
import {
  compareEvents,
  eventMatchesFilters,
  eventQueryParams,
  PAGE_SIZE,
} from "../lib/eventsQuery";
import type { EventSort, FeedEvent } from "../lib/eventTypes";

type Props = {
  api: string;
  category: string;
  days: string;
  onCategoryChange: (value: string) => void;
  onDaysChange: (value: string) => void;
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
  const [sortBy, setSortBy] = useState<EventSort>("priority");
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
          return updated.sort((a, b) => compareEvents(a, b, sortBy));
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
              <option value="priority">{t.sortPriority}</option>
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
          || sortBy !== "priority") && (
          <button
            type="button"
            className="ev-clear-filters"
            onClick={() => {
              setQuery("");
              setImportance("any");
              setOpenness("any");
              setModelLevel("any");
              setSortBy("priority");
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
        const levelLabel = modelLevelLabel(featured.model_level, language);
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
                  {levelLabel && (
                    <span className={`ev-model-level ${featured.model_level}`}>{levelLabel}</span>
                  )}
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
