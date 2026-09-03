"use client";

import { useEffect, useRef, useState } from "react";
import ModelAvatar from "./ModelAvatar";
import { useInfiniteScroll } from "../lib/useInfiniteScroll";
import { useLanguage, type Language } from "../lib/i18n";

function organizationSlug(organization: string) {
  return organization
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const PAGE_SIZE = 25;

type RadarScoreItem = {
  rank: number;
  model_name: string;
  organization: string;
  score: number;
  coverage: number;
  benchmark_count: number;
  category_count: number;
  openness: string | null;
};

const OPENNESS_LABELS: Record<Language, Record<string, string>> = {
  tr: { open_source: "Açık Kaynak", open_weight: "Açık Ağırlık", proprietary: "Kapalı Kaynak" },
  en: { open_source: "Open Source", open_weight: "Open Weight", proprietary: "Closed Source" },
};

type BenchmarkLeader = {
  benchmark: string;
  label: string;
  category: string;
  model_name: string;
  organization: string;
  score: number;
  published_at: string;
};

type Methodology = {
  version: string;
  score_type: string;
  is_first_party_evaluation: boolean;
  normalization: string;
  aggregation: string;
  missing_data: string;
  minimum_coverage: { benchmarks: number; categories: number };
};

type RadarScoreData = {
  snapshot_at: string | null;
  eligible_count: number;
  total: number;
  active_benchmarks: string[];
  methodology: Methodology;
  leaders: BenchmarkLeader[];
  items: RadarScoreItem[];
};

type RadarScoreChangeEvent = {
  kind: "new_leader" | "entered_top3" | "new_entry";
  catalog_model_id: string;
  model_name: string;
  organization: string;
  rank: number;
  previous_rank: number | null;
  score: number;
  title: string;
};

type RadarScoreChangesData = {
  window_hours: number;
  current_snapshot_at: string | null;
  compared_snapshot_at: string | null;
  counts: { new_leader: number; entered_top3: number; new_entry: number };
  total: number;
  items: RadarScoreChangeEvent[];
};

type Props = {
  api: string;
  onOpenLeaderboards: () => void;
  onOpenEvents: () => void;
};

const KIND_LABELS: Record<Language, Record<string, string>> = {
  tr: { new_leader: "Yeni lider", entered_top3: "Top 3'e girdi", new_entry: "Yeni giriş" },
  en: { new_leader: "New leader", entered_top3: "Entered Top 3", new_entry: "New entry" },
};

// The API returns a server-generated title in Turkish only; build a natural
// English equivalent client-side from the structured kind/model fields
// rather than translating the opaque string.
function changeTitle(item: RadarScoreChangeEvent, language: Language): string {
  if (language === "tr") return item.title;
  if (item.kind === "new_leader") return `${item.model_name} took the lead`;
  if (item.kind === "entered_top3") return `${item.model_name} entered the Top 3`;
  return `${item.model_name} entered the ranking`;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value));
}

const RANK_ACCENT = ["gold", "silver", "bronze"] as const;

export default function OverviewIntelligence({ api, onOpenLeaderboards, onOpenEvents }: Props) {
  const { language, locale } = useLanguage();
  const [head, setHead] = useState<Omit<RadarScoreData, "items"> | null>(null);
  const [items, setItems] = useState<RadarScoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [radar, setRadar] = useState<RadarScoreChangesData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/api/v1/insights/radar-score?limit=${PAGE_SIZE}&offset=0`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!data) return;
        const { items: firstPage, ...rest } = data as RadarScoreData;
        setHead(rest);
        setItems(firstPage);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/api/v1/insights/radar-score-changes`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (data) setRadar(data as RadarScoreChangesData); })
      .catch(() => {});
    return () => controller.abort();
  }, [api]);

  const hasMore = head !== null && items.length < head.total;

  const loadMore = async () => {
    if (!hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const response = await fetch(`${api}/api/v1/insights/radar-score?limit=${PAGE_SIZE}&offset=${items.length}`);
      if (!response.ok) return;
      const data = await response.json() as RadarScoreData;
      setItems(current => [...current, ...data.items]);
    } catch {
      /* keep current page */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loadingMore);
  const openness = OPENNESS_LABELS[language];
  const kindLabels = KIND_LABELS[language];

  return (
    <section className="overview-intelligence" aria-label={language === "tr" ? "LLM Radar skoru" : "LLM Radar score"}>
      <article className="overview-score-panel">
        <header className="overview-panel-head">
          <div>
            <p className="kicker">{language === "tr" ? "LLM RADAR SIRALAMASI" : "LLM RADAR RANKING"}</p>
            <h2>{language === "tr" ? "LLM Radar Skoru" : "LLM Radar Score"}</h2>
            <p>{language === "tr"
              ? "Onlarca bağımsız benchmark'ı tek bir metodolojiyle normalize edip ağırlıklandırarak ürettiğimiz kendi kompozit sıralamamız — modellerin genel gücünü tek bir 0–100 skorda özetler."
              : "Our own composite ranking, built by normalizing and weighting dozens of independent benchmarks under one methodology — it summarizes a model's overall strength in a single 0–100 score."}</p>
          </div>
          <div className="overview-panel-meta">
            <span>{head?.total ?? "—"} {language === "tr" ? "model" : "models"}</span>
            <small>{language === "tr" ? "Güncelleme" : "Updated"}: {formatDate(head?.snapshot_at ?? null, locale)}</small>
          </div>
        </header>

        <div className="overview-score-list">
          {loading ? (
            <p className="overview-empty">{language === "tr" ? "Yükleniyor…" : "Loading…"}</p>
          ) : items.length ? (
            <>
              {items.map(item => (
                <div
                  className={`overview-score-row${item.rank <= 3 ? ` rank-${RANK_ACCENT[item.rank - 1]}` : ""}`}
                  key={`${item.organization}:${item.model_name}`}
                >
                  <b>{item.rank}</b>
                  <ModelAvatar
                    name={item.model_name}
                    companySlug={organizationSlug(item.organization)}
                    companyName={item.organization}
                    size="md"
                  />
                  <div>
                    <span className="overview-model-name-row">
                      <strong>{item.model_name}</strong>
                      {item.openness && (
                        <em className={`overview-openness-badge ${item.openness}`}>
                          {openness[item.openness] ?? item.openness}
                        </em>
                      )}
                    </span>
                    <small>{item.organization} · {item.benchmark_count} benchmark / {item.category_count} {language === "tr" ? "kategori" : "categories"}</small>
                  </div>
                  <div className="overview-score-value">
                    <strong>{item.score.toLocaleString(locale, { maximumFractionDigits: 1 })}</strong>
                    <span className="overview-score-track"><i style={{ width: `${item.score}%` }} /></span>
                    <small>%{item.coverage} {language === "tr" ? "kapsam" : "coverage"}</small>
                  </div>
                </div>
              ))}
              {hasMore && <div ref={sentinelRef} className="overview-score-sentinel" aria-hidden="true" />}
              {loadingMore && <p className="overview-loading-more">{language === "tr" ? "Daha fazla model yükleniyor…" : "Loading more models…"}</p>}
            </>
          ) : <p className="overview-empty">{language === "tr" ? "Yeterli kapsama ulaşan model verisi bekleniyor." : "Waiting for models to reach sufficient benchmark coverage."}</p>}
        </div>

        <div className="overview-leaders">
          <div className="overview-subhead">
            <strong>{language === "tr" ? "Benchmark liderleri" : "Benchmark leaders"}</strong>
            <button type="button" onClick={onOpenLeaderboards}>{language === "tr" ? "Tüm sıralamalar →" : "All rankings →"}</button>
          </div>
          <div className="overview-leader-grid">
            {(head?.leaders ?? []).map(leader => (
              <div key={leader.benchmark}>
                <small>{leader.label}</small>
                <div className="overview-leader-model">
                  <ModelAvatar
                    name={leader.model_name}
                    companySlug={organizationSlug(leader.organization)}
                    companyName={leader.organization}
                    size="sm"
                  />
                  <span>
                    <strong>{leader.model_name}</strong>
                    <em>{leader.organization}</em>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {head?.methodology && (
          <details className="overview-method">
            <summary>{language === "tr" ? "Skor nasıl hesaplanıyor?" : "How is the score calculated?"}</summary>
            <p>{head.methodology.normalization} {head.methodology.aggregation}</p>
            <p>{head.methodology.missing_data} {language === "tr"
              ? `En az ${head.methodology.minimum_coverage.benchmarks} benchmark ve ${head.methodology.minimum_coverage.categories} kategori gerekir.`
              : `Requires at least ${head.methodology.minimum_coverage.benchmarks} benchmarks and ${head.methodology.minimum_coverage.categories} categories.`}</p>
            <small>{head.methodology.version} · {language === "tr" ? "Bu bir LLM Radar eval testi değildir." : "This is not a first-party LLM Radar evaluation."}</small>
          </details>
        )}
      </article>

      <article className="overview-radar-panel">
        <header className="overview-panel-head">
          <div>
            <p className="kicker">{language === "tr" ? "KENDİ SIRALAMAMIZDA SON 24 SAAT" : "LAST 24 HOURS IN OUR RANKING"}</p>
            <h2>{language === "tr" ? "Son 24 Saat" : "Last 24 Hours"}</h2>
            <p>{language === "tr"
              ? "LLM Radar Skoru'nun aynı metodolojiyle 24 saat önceki haliyle kıyaslanmasından üretilir — yeni giren modeller, Top 3 değişimleri ve yeni liderler."
              : "Generated by comparing the LLM Radar Score against its state 24 hours ago under the same methodology — new entries, Top 3 changes, and new leaders."}</p>
          </div>
          <div className="overview-panel-meta">
            <span>{radar?.total ?? "—"} {language === "tr" ? "değişiklik" : "changes"}</span>
            <small>{formatDate(radar?.compared_snapshot_at ?? null, locale)} → {formatDate(radar?.current_snapshot_at ?? null, locale)}</small>
          </div>
        </header>

        <div className="overview-radar-counts">
          <span><b>{radar?.counts.new_entry ?? 0}</b> {language === "tr" ? "yeni giriş" : "new entries"}</span>
          <span><b>{radar?.counts.entered_top3 ?? 0}</b> {language === "tr" ? "Top 3'e giren" : "entered Top 3"}</span>
          <span><b>{radar?.counts.new_leader ?? 0}</b> {language === "tr" ? "yeni lider" : "new leaders"}</span>
        </div>

        <div className="overview-radar-list">
          {radar?.items.length ? radar.items.map(item => (
            <div className="overview-radar-row" key={item.catalog_model_id}>
              <span className={`overview-radar-icon ${item.kind}`} aria-hidden="true" />
              <ModelAvatar
                name={item.model_name}
                companySlug={organizationSlug(item.organization)}
                companyName={item.organization}
                size="sm"
              />
              <div>
                <small>{kindLabels[item.kind] ?? (language === "tr" ? "Değişiklik" : "Change")}</small>
                <strong>{changeTitle(item, language)}</strong>
                <span>{item.organization} · {item.score.toLocaleString(locale, { maximumFractionDigits: 1 })} {language === "tr" ? "puan" : "pts"}</span>
              </div>
            </div>
          )) : <p className="overview-empty">{language === "tr" ? "Son 24 saatte LLM Radar Skoru sıralamasında değişiklik yok." : "No changes in the LLM Radar Score ranking over the last 24 hours."}</p>}
        </div>
        <button type="button" className="overview-all-button" onClick={onOpenEvents}>{language === "tr" ? "Tüm gelişmeleri aç →" : "Open all developments →"}</button>
      </article>
    </section>
  );
}
