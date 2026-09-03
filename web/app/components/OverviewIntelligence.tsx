"use client";

import { useEffect, useRef, useState } from "react";
import ModelAvatar from "./ModelAvatar";
import { useInfiniteScroll } from "../lib/useInfiniteScroll";

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

const KIND_LABELS: Record<string, string> = {
  new_leader: "Yeni lider",
  entered_top3: "Top 3'e girdi",
  new_entry: "Yeni giriş",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value));
}

const RANK_ACCENT = ["gold", "silver", "bronze"] as const;

export default function OverviewIntelligence({ api, onOpenLeaderboards, onOpenEvents }: Props) {
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

  return (
    <section className="overview-intelligence" aria-label="LLM Radar skoru">
      <article className="overview-score-panel">
        <header className="overview-panel-head">
          <div>
            <p className="kicker">LLM RADAR SIRALAMASI</p>
            <h2>LLM Radar Skoru</h2>
            <p>Onlarca bağımsız benchmark'ı tek bir metodolojiyle normalize edip ağırlıklandırarak ürettiğimiz kendi kompozit sıralamamız — modellerin genel gücünü tek bir 0–100 skorda özetler.</p>
          </div>
          <div className="overview-panel-meta">
            <span>{head?.total ?? "—"} model</span>
            <small>Güncelleme: {formatDate(head?.snapshot_at ?? null)}</small>
          </div>
        </header>

        <div className="overview-score-list">
          {loading ? (
            <p className="overview-empty">Yükleniyor…</p>
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
                    <strong>{item.model_name}</strong>
                    <small>{item.organization} · {item.benchmark_count} benchmark / {item.category_count} kategori</small>
                  </div>
                  <div className="overview-score-value">
                    <strong>{item.score.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</strong>
                    <span className="overview-score-track"><i style={{ width: `${item.score}%` }} /></span>
                    <small>%{item.coverage} kapsam</small>
                  </div>
                </div>
              ))}
              {hasMore && <div ref={sentinelRef} className="overview-score-sentinel" aria-hidden="true" />}
              {loadingMore && <p className="overview-loading-more">Daha fazla model yükleniyor…</p>}
            </>
          ) : <p className="overview-empty">Yeterli kapsama ulaşan model verisi bekleniyor.</p>}
        </div>

        <div className="overview-leaders">
          <div className="overview-subhead">
            <strong>Benchmark liderleri</strong>
            <button type="button" onClick={onOpenLeaderboards}>Tüm sıralamalar →</button>
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
            <summary>Skor nasıl hesaplanıyor?</summary>
            <p>{head.methodology.normalization} {head.methodology.aggregation}</p>
            <p>{head.methodology.missing_data} En az {head.methodology.minimum_coverage.benchmarks} benchmark ve {head.methodology.minimum_coverage.categories} kategori gerekir.</p>
            <small>{head.methodology.version} · Bu bir LLM Radar eval testi değildir.</small>
          </details>
        )}
      </article>

      <article className="overview-radar-panel">
        <header className="overview-panel-head">
          <div>
            <p className="kicker">KENDİ SIRALAMAMIZDA SON 24 SAAT</p>
            <h2>Son 24 Saat</h2>
            <p>LLM Radar Skoru'nun aynı metodolojiyle 24 saat önceki haliyle kıyaslanmasından üretilir — yeni giren modeller, Top 3 değişimleri ve yeni liderler.</p>
          </div>
          <div className="overview-panel-meta">
            <span>{radar?.total ?? "—"} değişiklik</span>
            <small>{formatDate(radar?.compared_snapshot_at ?? null)} → {formatDate(radar?.current_snapshot_at ?? null)}</small>
          </div>
        </header>

        <div className="overview-radar-counts">
          <span><b>{radar?.counts.new_entry ?? 0}</b> yeni giriş</span>
          <span><b>{radar?.counts.entered_top3 ?? 0}</b> Top 3'e giren</span>
          <span><b>{radar?.counts.new_leader ?? 0}</b> yeni lider</span>
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
                <small>{KIND_LABELS[item.kind] ?? "Değişiklik"}</small>
                <strong>{item.title}</strong>
                <span>{item.organization} · {item.score.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} puan</span>
              </div>
            </div>
          )) : <p className="overview-empty">Son 24 saatte LLM Radar Skoru sıralamasında değişiklik yok.</p>}
        </div>
        <button type="button" className="overview-all-button" onClick={onOpenEvents}>Tüm gelişmeleri aç →</button>
      </article>
    </section>
  );
}
