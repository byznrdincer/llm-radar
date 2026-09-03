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

type RadarEvent = {
  id: string;
  kind: string;
  title: string;
  effective_at: string;
  source: string | null;
  source_url: string | null;
  verification_status: string;
};

type Radar24hData = {
  total: number;
  counts: Record<string, number>;
  items: RadarEvent[];
};

type Props = {
  api: string;
  onOpenLeaderboards: () => void;
  onOpenEvents: () => void;
};

const KIND_LABELS: Record<string, string> = {
  model_release: "Yeni model",
  benchmark_leader: "Yeni lider",
  benchmark_top3: "İlk Top 3",
  price_change: "Fiyat",
  capability_change: "Yetenek",
  provider_update: "API / sağlayıcı",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));
}

export default function OverviewIntelligence({ api, onOpenLeaderboards, onOpenEvents }: Props) {
  const [score, setScore] = useState<RadarScoreData | null>(null);
  const [radar, setRadar] = useState<Radar24hData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const optional = (path: string) => fetch(`${api}${path}`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .catch(() => null);
    void Promise.all([
      optional("/api/v1/insights/radar-score?limit=5"),
      optional("/api/v1/insights/radar-24h?limit=6"),
    ]).then(([scoreData, radarData]) => {
      if (scoreData) setScore(scoreData as RadarScoreData);
      if (radarData) setRadar(radarData as Radar24hData);
    });
    return () => controller.abort();
  }, [api]);

  return (
    <section className="overview-intelligence" aria-label="LLM Radar skorları ve son 24 saat">
      <article className="overview-score-panel">
        <header className="overview-panel-head">
          <div>
            <p className="kicker">ORTAK GÖRÜNÜM</p>
            <h2>LLM Radar Skoru</h2>
            <p>Bağımsız benchmark sıralamalarından üretilen 0–100 bileşik endeks.</p>
          </div>
          <div className="overview-panel-meta">
            <span>{score?.active_benchmarks.length ?? "—"} benchmark</span>
            <small>{formatDate(score?.snapshot_at ?? null)}</small>
          </div>
        </header>

        <div className="overview-score-list">
          {score?.items.length ? score.items.map(item => (
            <div className="overview-score-row" key={`${item.organization}:${item.model_name}`}>
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
          <div className="overview-subhead"><strong>Benchmark liderleri</strong><button type="button" onClick={onOpenLeaderboards}>Tüm sıralamalar →</button></div>
          <div className="overview-leader-grid">
            {(score?.leaders ?? []).slice(0, 4).map(leader => (
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

      <article className="overview-radar-panel">
        <header className="overview-panel-head">
          <div>
            <p className="kicker">CANLI SİNYALLER</p>
            <h2>Son 24 Saat</h2>
            <p>Kaynaklı değişim kayıtlarından, tekrarları ayıklanmış özet.</p>
          </div>
          <div className="overview-radar-total"><strong>{radar?.total ?? "—"}</strong><small>sinyal</small></div>
        </header>

        <div className="overview-radar-counts">
          <span><b>{radar?.counts.model_release ?? 0}</b> yeni model</span>
          <span><b>{(radar?.counts.benchmark_leader ?? 0) + (radar?.counts.benchmark_top3 ?? 0)}</b> benchmark</span>
          <span><b>{radar?.counts.price_change ?? 0}</b> fiyat</span>
          <span><b>{radar?.counts.capability_change ?? 0}</b> yetenek</span>
        </div>

        <div className="overview-radar-list">
          {radar?.items.length ? radar.items.map(item => (
            <div className="overview-radar-row" key={item.id}>
              <span className={`overview-radar-icon ${item.kind}`} aria-hidden="true" />
              <div>
                <small>{KIND_LABELS[item.kind] ?? "Gelişme"} · {formatTime(item.effective_at)}</small>
                <strong>{item.title}</strong>
                <span>{item.source ?? "Doğrulanmış kaynak"}</span>
              </div>
              {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" aria-label={`${item.title} kaynağını aç`}>↗</a>}
            </div>
          )) : <p className="overview-empty">Son 24 saatte doğrulanmış yüksek sinyal bulunamadı.</p>}
        </div>
        <button type="button" className="overview-all-button" onClick={onOpenEvents}>Tüm gelişmeleri aç →</button>
      </article>
    </section>
  );
}
