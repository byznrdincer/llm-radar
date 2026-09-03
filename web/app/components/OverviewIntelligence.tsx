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

type Props = {
  api: string;
  onOpenLeaderboards: () => void;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value));
}

const RANK_ACCENT = ["gold", "silver", "bronze"] as const;

export default function OverviewIntelligence({ api, onOpenLeaderboards }: Props) {
  const [head, setHead] = useState<Omit<RadarScoreData, "items"> | null>(null);
  const [items, setItems] = useState<RadarScoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

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
            <p className="kicker">ORTAK GÖRÜNÜM · KOMPOZİT ENDEKS</p>
            <h2>LLM Radar Skoru</h2>
            <p>Bağımsız benchmark sıralamalarının ağırlıklı ortalamasından üretilen tek bir 0–100 skor. Kendi eval testimiz değil — yalnızca ilgili benchmarklarda gerçekten yer alan modeller listelenir.</p>
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
    </section>
  );
}
