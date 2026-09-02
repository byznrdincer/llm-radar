"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PeriodDays = 30 | 90 | 365 | 3650;
type MarketView = "country" | "provider" | "openness";

type CountryPoint = {
  date: string;
  usa: number | null;
  china: number | null;
  usa_model: string | null;
  china_model: string | null;
  usa_organization: string | null;
  china_organization: string | null;
};

type MarketModel = {
  model: string;
  organization: string;
  region: "USA" | "China" | null;
  delta: number;
  score: number;
};

type ProviderPoint = {
  organization: string;
  model: string;
  score: number;
  region: "USA" | "China" | null;
};

type MarketDashboardData = {
  generated_at: string;
  benchmark: { slug: string; name: string; label: string; metric: string };
  period_days: number;
  published_at: string | null;
  summary: {
    frontier_gap: number | null;
    frontier_gap_delta: number | null;
    open_weight_share: number;
    open_weight_models: number;
    new_models_this_month: number;
    new_models_delta: number;
    fastest_riser: MarketModel | null;
    total_models: number;
    active_providers: number;
  };
  country_trend: CountryPoint[];
  providers: ProviderPoint[];
  movers: MarketModel[];
  insights: string[];
  method_note: string;
};

type OpennessData = {
  metric: string;
  interpretation: string;
  items: {
    year: number;
    open_source: number;
    open_weight: number;
    proprietary: number;
    unknown: number;
  }[];
};

type Props = {
  api: string;
  onNavigate: (section: string) => void;
  onOpenWeight: () => void;
};

const CHART_TOOLTIP = {
  backgroundColor: "#101d18",
  border: "1px solid #33453d",
  borderRadius: "6px",
  color: "#edf5ef",
  fontSize: "11px",
};

const number = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

function signed(value: number | null, suffix = "puan"): string {
  if (value == null) return "Veri yok";
  return `${value > 0 ? "+" : ""}${number.format(value)} ${suffix}`;
}

function dateLabel(value: string, includeYear = false): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: includeYear ? "2-digit" : undefined,
  }).format(new Date(`${value}T00:00:00`));
}

function axisDateLabel(value: number, periodDays: PeriodDays): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: periodDays <= 90 ? "2-digit" : undefined,
    month: "short",
    year: periodDays > 90 ? "2-digit" : undefined,
  }).format(new Date(value));
}

function shortModel(value: string | null): string {
  if (!value) return "";
  return value.length > 20 ? `${value.slice(0, 18)}…` : value;
}

function CountryChart({ data, periodDays }: { data: CountryPoint[]; periodDays: PeriodDays }) {
  if (!data.length) return <div className="market-chart-empty">Seçili dönemde ülke verisi yok.</div>;
  const latestTimestamp = Date.parse(`${data[data.length - 1].date}T00:00:00Z`);
  const earliestTimestamp = Date.parse(`${data[0].date}T00:00:00Z`);
  const domainStart = periodDays === 3650
    ? (earliestTimestamp === latestTimestamp
        ? latestTimestamp - 30 * 24 * 60 * 60 * 1000
        : earliestTimestamp)
    : latestTimestamp - periodDays * 24 * 60 * 60 * 1000;
  const chartData = data.map((point, index) => {
    const last = index === data.length - 1;
    return {
      ...point,
      timestamp: Date.parse(`${point.date}T00:00:00Z`),
      usa_label: last ? shortModel(point.usa_model) : "",
      china_label: last ? shortModel(point.china_model) : "",
      usa_end: last && point.usa != null ? number.format(point.usa) : "",
      china_end: last && point.china != null ? number.format(point.china) : "",
    };
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 36, right: 62, left: -10, bottom: 2 }}>
        <CartesianGrid stroke="#34453e" strokeDasharray="3 4" vertical={false} />
        <XAxis
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={[domainStart, latestTimestamp]}
          tickFormatter={(value) => axisDateLabel(Number(value), periodDays)}
          tick={{ fill: "#93a39a", fontSize: 10 }}
        />
        <YAxis domain={["dataMin - 10", "dataMax + 10"]} tick={{ fill: "#93a39a", fontSize: 10 }} />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          labelFormatter={(value) => axisDateLabel(Number(value), periodDays)}
        />
        <Legend iconType="line" wrapperStyle={{ color: "#aebcb4", fontSize: "10px" }} />
        <Line
          type="monotone"
          dataKey="usa"
          name="ABD"
          stroke="#58c7ba"
          strokeWidth={3}
          dot={{ r: 3, fill: "#58c7ba" }}
          connectNulls
          isAnimationActive={false}
        >
          <LabelList dataKey="usa_label" position="top" fill="#b9d8d1" fontSize={9} />
          <LabelList dataKey="usa_end" position="right" fill="#58c7ba" fontSize={12} fontWeight={800} />
        </Line>
        <Line
          type="monotone"
          dataKey="china"
          name="Çin"
          stroke="#b9ff25"
          strokeWidth={3}
          dot={{ r: 3, fill: "#b9ff25" }}
          connectNulls
          isAnimationActive={false}
        >
          <LabelList dataKey="china_label" position="bottom" fill="#d6ec9d" fontSize={9} />
          <LabelList dataKey="china_end" position="right" fill="#b9ff25" fontSize={12} fontWeight={800} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

function ProviderChart({ data }: { data: ProviderPoint[] }) {
  const chartData = data.map((item) => ({
    ...item,
    label: item.organization.length > 18 ? `${item.organization.slice(0, 16)}…` : item.organization,
  }));
  if (!chartData.length) return <div className="market-chart-empty">Seçili benchmark için sağlayıcı verisi yok.</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 22, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#34453e" strokeDasharray="3 4" horizontal={false} />
        <XAxis type="number" domain={["dataMin - 20", "dataMax + 10"]} tick={{ fill: "#93a39a", fontSize: 10 }} />
        <YAxis dataKey="label" type="category" width={92} tick={{ fill: "#b7c4bd", fontSize: 10 }} />
        <Tooltip contentStyle={CHART_TOOLTIP} />
        <Bar dataKey="score" name="Skor" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {chartData.map((item) => (
            <Cell
              key={`${item.organization}-${item.model}`}
              fill={item.region === "USA" ? "#58c7ba" : item.region === "China" ? "#b9ff25" : "#9a84e8"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function OpennessChart({ data }: { data: OpennessData["items"] }) {
  if (!data.length) return <div className="market-chart-empty">Yayın tarihli model verisi yok.</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 18, right: 18, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="openSourceArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b9ff25" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#b9ff25" stopOpacity={0.22} />
          </linearGradient>
          <linearGradient id="openWeightArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#58c7ba" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#58c7ba" stopOpacity={0.2} />
          </linearGradient>
          <linearGradient id="proprietaryArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a990e6" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#a990e6" stopOpacity={0.2} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#34453e" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="year" tick={{ fill: "#93a39a", fontSize: 10 }} />
        <YAxis tick={{ fill: "#93a39a", fontSize: 10 }} />
        <Tooltip contentStyle={CHART_TOOLTIP} />
        <Legend iconType="circle" wrapperStyle={{ color: "#aebcb4", fontSize: "10px" }} />
        <Area type="monotone" dataKey="proprietary" name="Proprietary" stackId="1" stroke="#a990e6" fill="url(#proprietaryArea)" isAnimationActive={false} />
        <Area type="monotone" dataKey="open_weight" name="Open Weight" stackId="1" stroke="#58c7ba" fill="url(#openWeightArea)" isAnimationActive={false} />
        <Area type="monotone" dataKey="open_source" name="Open Source" stackId="1" stroke="#b9ff25" fill="url(#openSourceArea)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function MarketAnalysisDashboard({ api, onNavigate, onOpenWeight }: Props) {
  const [days, setDays] = useState<PeriodDays>(30);
  const [view, setView] = useState<MarketView>("country");
  const [dashboard, setDashboard] = useState<MarketDashboardData | null>(null);
  const [openness, setOpenness] = useState<OpennessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`${api}/api/v1/insights/market-dashboard?benchmark=arena-text&days=${days}`, {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error("Pazar verisi alınamadı");
        return response.json() as Promise<MarketDashboardData>;
      }),
      fetch(`${api}/api/v1/insights/openness-trend`, { signal: controller.signal }).then(
        (response) => {
          if (!response.ok) throw new Error("Açıklık verisi alınamadı");
          return response.json() as Promise<OpennessData>;
        },
      ),
    ])
      .then(([marketData, opennessData]) => {
        setDashboard(marketData);
        setOpenness(opennessData);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, days]);

  const opennessRows = useMemo(() => openness?.items ?? [], [openness]);
  const currentGap = dashboard?.summary.frontier_gap ?? null;
  const gapDelta = dashboard?.summary.frontier_gap_delta ?? null;
  const riser = dashboard?.summary.fastest_riser;
  const snapshotDate = dashboard?.published_at
    ? new Date(`${dashboard.published_at}T00:00:00`).toLocaleDateString("tr-TR")
    : "Veri bekleniyor";
  const changeDays = (value: PeriodDays) => {
    setLoading(true);
    setError(false);
    setDays(value);
  };

  const primaryChart = view === "country"
    ? <CountryChart data={dashboard?.country_trend ?? []} periodDays={days} />
    : view === "provider"
      ? <ProviderChart data={dashboard?.providers ?? []} />
      : <OpennessChart data={opennessRows} />;
  const primaryTitle = view === "country"
    ? "Çin vs ABD frontier yarışı"
    : view === "provider"
      ? "Sağlayıcıların frontier görünümü"
      : "Açıklık sınıflarının gelişimi";
  const primaryDescription = view === "openness"
    ? openness?.metric ?? "Katalogdaki yayınlanan model sayısı"
    : dashboard?.benchmark.metric ?? "Benchmark skoru — yüksek daha iyi";
  const completeCountryPoints = (dashboard?.country_trend ?? []).filter(
    (point) => point.usa != null && point.china != null,
  );
  const firstCountryPoint = completeCountryPoints[0];
  const lastCountryPoint = completeCountryPoints[completeCountryPoints.length - 1];
  const firstGap = firstCountryPoint
    ? Math.abs(Number(firstCountryPoint.usa) - Number(firstCountryPoint.china))
    : null;

  return (
    <section className="market-dashboard app-page" id="insights" aria-busy={loading}>
      <header className="market-hero">
        <div>
          <p className="kicker">PAZAR ANALİZİ</p>
          <h2>Yarışın metriği açık.</h2>
          <p>Frontier yarışını puanlar, yayın eğilimleri ve doğrulanmış katalog verileriyle izleyin.</p>
        </div>
        <p className="market-live-note">
          Grafikler statik görsel değil; güncel katalog ve benchmark snapshot’larından üretilir.
          <strong> Veriler scheduler akışıyla güncellenir.</strong>
        </p>
      </header>

      <div className="market-controls" aria-label="Pazar analizi filtreleri">
        <div className="market-control-group">
          <span>Zaman aralığı</span>
          <div className="market-segmented" role="group" aria-label="Zaman aralığı">
            {([[30, "30G"], [90, "90G"], [365, "1Y"], [3650, "Tümü"]] as const).map(([value, label]) => (
              <button key={value} type="button" className={days === value ? "active" : ""} onClick={() => changeDays(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="market-control-group">
          <span>Görünüm</span>
          <div className="market-segmented" role="group" aria-label="Grafik görünümü">
            {([['country', 'Ülke'], ['provider', 'Sağlayıcı'], ['openness', 'Açıklık']] as const).map(([value, label]) => (
              <button key={value} type="button" className={view === value ? "active" : ""} onClick={() => setView(value)}>{label}</button>
            ))}
          </div>
        </div>
        <p className="market-coverage-note">
          <span>VERİ KAPSAMI</span>
          Arena Text snapshot’ları · {dashboard?.country_trend.length ?? 0} ölçüm noktası
        </p>
      </div>

      {error && <div className="market-error">Canlı pazar verisi şu anda alınamadı. API bağlantısını kontrol edin.</div>}

      <div className="market-kpi-grid">
        <article>
          <i>⌁</i><div><span>Frontier farkı</span><strong>{currentGap == null ? "—" : `${number.format(currentGap)} puan`}</strong><small>Çin ve ABD farkı <b className={gapDelta != null && gapDelta <= 0 ? "positive" : "negative"}>{signed(gapDelta)}</b></small></div>
        </article>
        <article>
          <i>◔</i><div><span>Open-weight payı</span><strong>%{number.format(dashboard?.summary.open_weight_share ?? 0)}</strong><small><b>{number.format(dashboard?.summary.open_weight_models ?? 0)}</b> doğrulanmış model</small></div>
        </article>
        <article>
          <i>✣</i><div><span>Bu ay yeni model</span><strong>{number.format(dashboard?.summary.new_models_this_month ?? 0)}</strong><small>Kataloğa eklenen <b className={(dashboard?.summary.new_models_delta ?? 0) >= 0 ? "positive" : "negative"}>{signed(dashboard?.summary.new_models_delta ?? 0, "önceki aya göre")}</b></small></div>
        </article>
        <article>
          <i>↗</i><div><span>En hızlı yükselen</span><strong>{riser?.model ?? "—"}</strong><small>{riser ? `${riser.organization} · ${signed(riser.delta)}` : "Karşılaştırılabilir snapshot bekleniyor"}</small></div>
        </article>
      </div>

      <div className="market-chart-grid">
        <article className="market-panel market-chart-panel">
          <header>
            <div><h3>{primaryTitle}</h3><p>{primaryDescription}</p></div>
            {view === "country" && firstGap != null && currentGap != null ? (
              <div className="market-gap-chip">
                <strong>Fark: {number.format(firstGap)} → {number.format(currentGap)}</strong>
                <small>
                  {firstCountryPoint ? dateLabel(firstCountryPoint.date, days >= 365) : "—"} → {lastCountryPoint ? dateLabel(lastCountryPoint.date, days >= 365) : "—"}
                </small>
              </div>
            ) : <span>Snapshot {snapshotDate}</span>}
          </header>
          <div className="market-chart-canvas">{primaryChart}</div>
          {view === "country" && lastCountryPoint && (
            <div className="market-frontier-leaders">
              <span><i className="usa" />ABD lideri <strong>{lastCountryPoint.usa_model}</strong><small>{lastCountryPoint.usa_organization}</small></span>
              <span><i className="china" />Çin lideri <strong>{lastCountryPoint.china_model}</strong><small>{lastCountryPoint.china_organization}</small></span>
            </div>
          )}
          <p className="market-method">ⓘ {view === "openness" ? openness?.interpretation : dashboard?.method_note}</p>
        </article>
        <article className="market-panel market-chart-panel">
          <header><div><h3>{view === "openness" ? "Ülke frontier eğilimi" : "Açıklık sınıflarının gelişimi"}</h3><p>{view === "openness" ? dashboard?.benchmark.metric : openness?.metric}</p></div><span>Canlı katalog</span></header>
          <div className="market-chart-canvas">
            {view === "openness"
              ? <CountryChart data={dashboard?.country_trend ?? []} periodDays={days} />
              : <OpennessChart data={opennessRows} />}
          </div>
          <p className="market-method">ⓘ {view === "openness" ? dashboard?.method_note : openness?.interpretation}</p>
        </article>
      </div>

      <div className="market-bottom-grid">
        <article className="market-panel market-insights">
          <header><i>◉</i><h3>Öne çıkan içgörüler</h3></header>
          <ul>{(dashboard?.insights ?? []).map((insight) => <li key={insight}><span>✓</span>{insight}</li>)}</ul>
        </article>
        <article className="market-panel market-movers">
          <header><i>⌁</i><h3>En hızlı yükselenler</h3></header>
          <ol>{(dashboard?.movers ?? []).slice(0, 3).map((item, index) => <li key={item.model}><b>{index + 1}</b><span><strong>{item.model}</strong><small>{item.organization}</small></span><em>+{number.format(item.delta)}<small>puan</small></em></li>)}</ol>
        </article>
        <article className="market-panel market-snapshot">
          <header><i>▥</i><h3>Pazar özeti</h3></header>
          <dl>
            <div><dt>Toplam model</dt><dd>{number.format(dashboard?.summary.total_models ?? 0)}</dd></div>
            <div><dt>Aktif fiyat sağlayıcısı</dt><dd>{number.format(dashboard?.summary.active_providers ?? 0)}</dd></div>
            <div><dt>Open-weight model</dt><dd>{number.format(dashboard?.summary.open_weight_models ?? 0)}</dd></div>
          </dl>
        </article>
        <article className="market-panel market-actions">
          <header><i>◎</i><h3>Harekete geçin</h3></header>
          <button type="button" className="primary" onClick={() => onNavigate("leaderboard")}>Frontier modelleri incele <span>›</span></button>
          <button type="button" onClick={onOpenWeight}>Open-weight filtrele <span>›</span></button>
          <button type="button" className="violet" onClick={() => onNavigate("compare")}>Karşılaştır <span>›</span></button>
        </article>
      </div>
    </section>
  );
}
