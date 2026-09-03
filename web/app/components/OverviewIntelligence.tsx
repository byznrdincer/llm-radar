"use client";

import { useEffect, useState } from "react";

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

type RadarScoreData = {
  snapshot_at: string | null;
  eligible_count: number;
  active_benchmarks: string[];
  methodology: {
    version: string;
    score_type: string;
    is_first_party_evaluation: boolean;
    normalization: string;
    aggregation: string;
    missing_data: string;
    minimum_coverage: { benchmarks: number; categories: number };
  };
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
  const [score, setScore] = useState<RadarScoreData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/api/v1/insights/radar-score?limit=8`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (data) setScore(data as RadarScoreData); })
      .catch(() => {});
    return () => controller.abort();
  }, [api]);

  return (
    <section className="overview-intelligence" aria-label="LLM Radar skoru">
      <article className="overview-score-panel">
        <header className="overview-panel-head">
          <div>
            <p className="kicker">ORTAK GÖRÜNÜM · KOMPOZİT ENDEKS</p>
            <h2>LLM Radar Skoru</h2>
            <p>Bağımsız benchmark sıralamalarının ağırlıklı ortalamasından üretilen tek bir 0–100 skor. Kendi eval testimiz değil.</p>
          </div>
          <div className="overview-panel-meta">
            <span>{score?.active_benchmarks.length ?? "—"} benchmark</span>
            <small>Güncelleme: {formatDate(score?.snapshot_at ?? null)}</small>
          </div>
        </header>

        <div className="overview-score-list">
          {score?.items.length ? score.items.map(item => (
            <div
              className={`overview-score-row${item.rank <= 3 ? ` rank-${RANK_ACCENT[item.rank - 1]}` : ""}`}
              key={`${item.organization}:${item.model_name}`}
            >
              <b>#{item.rank}</b>
              <div>
                <strong>{item.model_name}</strong>
                <small>{item.organization} · {item.benchmark_count} benchmark / {item.category_count} kategori</small>
              </div>
              <div className="overview-score-value">
                <strong>{item.score.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</strong>
                <span><i style={{ width: `${item.score}%` }} /></span>
                <small>%{item.coverage} kapsam</small>
              </div>
            </div>
          )) : <p className="overview-empty">Yeterli kapsama ulaşan model verisi bekleniyor.</p>}
        </div>

        <div className="overview-leaders">
          <div className="overview-subhead">
            <strong>Benchmark liderleri</strong>
            <button type="button" onClick={onOpenLeaderboards}>Tüm sıralamalar →</button>
          </div>
          <div className="overview-leader-grid">
            {(score?.leaders ?? []).map(leader => (
              <div key={leader.benchmark}>
                <small>{leader.label}</small>
                <strong>{leader.model_name}</strong>
                <span>{leader.organization}</span>
              </div>
            ))}
          </div>
        </div>

        {score?.methodology && (
          <details className="overview-method">
            <summary>Skor nasıl hesaplanıyor?</summary>
            <p>{score.methodology.normalization} {score.methodology.aggregation}</p>
            <p>{score.methodology.missing_data} En az {score.methodology.minimum_coverage.benchmarks} benchmark ve {score.methodology.minimum_coverage.categories} kategori gerekir.</p>
            <small>{score.methodology.version} · Bu bir LLM Radar eval testi değildir.</small>
          </details>
        )}
      </article>
    </section>
  );
}
