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
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PeriodDays = 30 | 90 | 365 | 3650;
type MarketView = "country" | "provider" | "openness";

type BenchmarkOption = {
  slug: string;
  name: string;
  snapshot_count: number;
  date_count: number;
  latest_date: string | null;
};

type CountryPoint = {
  date: string;
  usa: number | null;
  china: number | null;
  europe: number | null;
  canada: number | null;
  usa_model: string | null;
  china_model: string | null;
  europe_model: string | null;
  canada_model: string | null;
  usa_organization: string | null;
  china_organization: string | null;
  europe_organization: string | null;
  canada_organization: string | null;
  usa_changed?: boolean;
  china_changed?: boolean;
  europe_changed?: boolean;
  canada_changed?: boolean;
};

type OpennessClass = "open_source" | "open_weight" | "proprietary" | "unknown" | null;

type MarketModel = {
  model: string;
  organization: string;
  region: "USA" | "China" | "Europe" | "Canada" | null;
  openness?: OpennessClass;
  delta: number;
  score: number;
};

type ProviderPoint = {
  organization: string;
  model: string;
  score: number;
  region: "USA" | "China" | "Europe" | "Canada" | null;
  openness?: OpennessClass;
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
  return value.length > 22 ? `${value.slice(0, 20)}…` : value;
}

type CountrySide = "usa" | "china" | "europe" | "canada";

function selectFrontierAnnotations(
  data: CountryPoint[],
  side: CountrySide,
  limit: number,
): CountryPoint[] {
  const changedKey = `${side}_changed` as const;
  const scoreKey = side;

  const changed = data.filter(
    (point) => Boolean(point[changedKey]) && point[scoreKey] != null,
  );

  if (changed.length <= limit) return changed;

  // Keep the labels evenly distributed over the selected period. Every model
  // change is still available in the hover detail; only the visible callouts
  // are reduced so they do not overlap each other.
  const selected = Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round(index * (changed.length - 1) / (limit - 1));
    return changed[sourceIndex];
  });

  return selected.filter(
    (point, index) => index === 0 || point.date !== selected[index - 1].date,
  );
}

type CountryChartRow = CountryPoint & {
  timestamp: number;
  usa_end: string;
  china_end: string;
  europe_end: string;
  canada_end: string;
};

function CountryTooltip({ active, payload }: {
  active?: boolean;
  payload?: { payload?: CountryChartRow }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="market-country-tooltip">
      <strong>{dateLabel(point.date, true)}</strong>
      <div className="usa">
        <i />
        <span><b>ABD · {point.usa == null ? "—" : number.format(point.usa)}</b><small>{point.usa_model ?? "Model bilgisi yok"}{point.usa_organization ? ` · ${point.usa_organization}` : ""}</small></span>
      </div>
      <div className="china">
        <i />
        <span><b>Çin · {point.china == null ? "—" : number.format(point.china)}</b><small>{point.china_model ?? "Model bilgisi yok"}{point.china_organization ? ` · ${point.china_organization}` : ""}</small></span>
      </div>
      {point.europe != null && (
        <div className="europe">
          <i />
          <span><b>Avrupa · {number.format(point.europe)}</b><small>{point.europe_model ?? "Model bilgisi yok"}{point.europe_organization ? ` · ${point.europe_organization}` : ""}</small></span>
        </div>
      )}
      {point.canada != null && (
        <div className="canada">
          <i />
          <span><b>Kanada · {number.format(point.canada)}</b><small>{point.canada_model ?? "Model bilgisi yok"}{point.canada_organization ? ` · ${point.canada_organization}` : ""}</small></span>
        </div>
      )}
    </div>
  );
}

function CountryChart({ data, periodDays }: { data: CountryPoint[]; periodDays: PeriodDays }) {
  if (!data.length) {
    return <div className="market-chart-empty">Seçili dönemde ülke verisi yok.</div>;
  }

  const latestTimestamp = Date.parse(`${data[data.length - 1].date}T00:00:00Z`);
  const earliestTimestamp = Date.parse(`${data[0].date}T00:00:00Z`);

  const domainStart = periodDays === 3650
    ? (earliestTimestamp === latestTimestamp
        ? latestTimestamp - 30 * 24 * 60 * 60 * 1000
        : earliestTimestamp)
    : latestTimestamp - periodDays * 24 * 60 * 60 * 1000;

  const annotationLimit = periodDays === 3650 ? 5 : periodDays === 365 ? 4 : 3;

  const chartData = data.map((point, index) => {
    const last = index === data.length - 1;

    return {
      ...point,
      timestamp: Date.parse(`${point.date}T00:00:00Z`),
      usa_end: last && point.usa != null ? number.format(point.usa) : "",
      china_end: last && point.china != null ? number.format(point.china) : "",
      europe_end: last && point.europe != null ? number.format(point.europe) : "",
      canada_end: last && point.canada != null ? number.format(point.canada) : "",
    };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 55, right: 72, left: 0, bottom: 8 }}
      >
        <CartesianGrid
          stroke="#34453e"
          strokeDasharray="4 6"
          vertical={false}
        />

        <XAxis
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={[domainStart, latestTimestamp]}
          tickFormatter={(value) => axisDateLabel(Number(value), periodDays)}
          tick={{ fill: "#93a39a", fontSize: 10 }}
        />

        <YAxis
          domain={["dataMin - 5", "dataMax + 5"]}
          tickFormatter={(value) => number.format(Number(value))}
          tick={{ fill: "#93a39a", fontSize: 10 }}
        />

        <Tooltip content={<CountryTooltip />} />

        <Legend
          iconType="line"
          wrapperStyle={{ color: "#aebcb4", fontSize: "10px" }}
        />

        {selectFrontierAnnotations(data, "usa", annotationLimit)
          .map((sourcePoint, index) => {
            const point = chartData.find((item) => item.date === sourcePoint.date);
            if (!point || point.usa == null) return null;

            return (
              <ReferenceDot
                key={`usa-frontier-${point.date}`}
                x={point.timestamp}
                y={Number(point.usa)}
                r={4}
                fill="#58c7ba"
                stroke="#0b1712"
                strokeWidth={2}
                label={{
                  value: shortModel(point.usa_model),
                  position: "top",
                  fill: "#d5e9e4",
                  stroke: "#0b1712",
                  strokeWidth: 3,
                  paintOrder: "stroke",
                  fontSize: 9.5,
                  fontWeight: 800,
                  offset: index % 2 === 0 ? 12 : 20,
                }}
              />
            );
          })}

        {selectFrontierAnnotations(data, "china", annotationLimit)
          .map((sourcePoint, index) => {
            const point = chartData.find((item) => item.date === sourcePoint.date);
            if (!point || point.china == null) return null;

            return (
              <ReferenceDot
                key={`china-frontier-${point.date}`}
                x={point.timestamp}
                y={Number(point.china)}
                r={4}
                fill="#b9ff25"
                stroke="#0b1712"
                strokeWidth={2}
                label={{
                  value: shortModel(point.china_model),
                  position: "bottom",
                  fill: "#dff4a7",
                  stroke: "#0b1712",
                  strokeWidth: 3,
                  paintOrder: "stroke",
                  fontSize: 9.5,
                  fontWeight: 800,
                  offset: index % 2 === 0 ? 12 : 20,
                }}
              />
            );
          })}

        {selectFrontierAnnotations(data, "europe", annotationLimit)
          .map((sourcePoint, index) => {
            const point = chartData.find((item) => item.date === sourcePoint.date);
            if (!point || point.europe == null) return null;

            return (
              <ReferenceDot
                key={`europe-frontier-${point.date}`}
                x={point.timestamp}
                y={Number(point.europe)}
                r={4}
                fill="#f2b134"
                stroke="#0b1712"
                strokeWidth={2}
                label={{
                  value: shortModel(point.europe_model),
                  position: "top",
                  fill: "#f7dba0",
                  stroke: "#0b1712",
                  strokeWidth: 3,
                  paintOrder: "stroke",
                  fontSize: 9.5,
                  fontWeight: 800,
                  offset: index % 2 === 0 ? 12 : 20,
                }}
              />
            );
          })}

        {selectFrontierAnnotations(data, "canada", annotationLimit)
          .map((sourcePoint, index) => {
            const point = chartData.find((item) => item.date === sourcePoint.date);
            if (!point || point.canada == null) return null;

            return (
              <ReferenceDot
                key={`canada-frontier-${point.date}`}
                x={point.timestamp}
                y={Number(point.canada)}
                r={4}
                fill="#e0668a"
                stroke="#0b1712"
                strokeWidth={2}
                label={{
                  value: shortModel(point.canada_model),
                  position: "bottom",
                  fill: "#f6c3d3",
                  stroke: "#0b1712",
                  strokeWidth: 3,
                  paintOrder: "stroke",
                  fontSize: 9.5,
                  fontWeight: 800,
                  offset: index % 2 === 0 ? 12 : 20,
                }}
              />
            );
          })}

        <Line
          type="stepAfter"
          dataKey="usa"
          name="ABD"
          stroke="#58c7ba"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
          isAnimationActive={false}
        >
          <LabelList
            dataKey="usa_end"
            position="right"
            fill="#58c7ba"
            fontSize={12}
            fontWeight={800}
          />
        </Line>

        <Line
          type="stepAfter"
          dataKey="china"
          name="Çin"
          stroke="#b9ff25"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
          isAnimationActive={false}
        >
          <LabelList
            dataKey="china_end"
            position="right"
            fill="#b9ff25"
            fontSize={12}
            fontWeight={800}
          />
        </Line>

        <Line
          type="stepAfter"
          dataKey="europe"
          name="Avrupa"
          stroke="#f2b134"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
          isAnimationActive={false}
        >
          <LabelList
            dataKey="europe_end"
            position="right"
            fill="#f2b134"
            fontSize={12}
            fontWeight={800}
          />
        </Line>

        <Line
          type="stepAfter"
          dataKey="canada"
          name="Kanada"
          stroke="#e0668a"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
          isAnimationActive={false}
        >
          <LabelList
            dataKey="canada_end"
            position="right"
            fill="#e0668a"
            fontSize={12}
            fontWeight={800}
          />
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
              fill={item.region === "USA" ? "#58c7ba" : item.region === "China" ? "#b9ff25" : item.region === "Europe" ? "#f2b134" : "#6b7a72"}
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
        <Area type="monotone" dataKey="proprietary" name="Closed Source" stackId="1" stroke="#a990e6" fill="url(#proprietaryArea)" isAnimationActive={false} />
        <Area type="monotone" dataKey="open_weight" name="Open Weight" stackId="1" stroke="#58c7ba" fill="url(#openWeightArea)" isAnimationActive={false} />
        <Area type="monotone" dataKey="open_source" name="Open Source" stackId="1" stroke="#b9ff25" fill="url(#openSourceArea)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function MarketAnalysisDashboard({ api, onNavigate, onOpenWeight }: Props) {
  const [days, setDays] = useState<PeriodDays>(3650);
  const [benchmark, setBenchmark] = useState("arena-text");
  const [benchmarkOptions, setBenchmarkOptions] = useState<BenchmarkOption[]>([]);
  const [view, setView] = useState<MarketView>("country");
  const [dashboard, setDashboard] = useState<MarketDashboardData | null>(null);
  const [openness, setOpenness] = useState<OpennessData | null>(null);
  const [opennessFilter, setOpennessFilter] = useState<"all" | "open_source" | "open_weight" | "proprietary">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`${api}/api/v1/insights/frontier-benchmarks`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Benchmark seçenekleri alınamadı");
        return response.json() as Promise<{ items: BenchmarkOption[] }>;
      })
      .then((data) => {
        setBenchmarkOptions(data.items);

        if (data.items.length) {
          setBenchmark((current) =>
            data.items.some((item) => item.slug === current)
              ? current
              : data.items[0].slug,
          );
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(
        `${api}/api/v1/insights/market-dashboard?benchmark=${encodeURIComponent(benchmark)}&days=${days}`
        + (opennessFilter !== "all" ? `&openness=${opennessFilter}` : ""),
        { signal: controller.signal },
      ).then((response) => {
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
  }, [api, days, benchmark, opennessFilter]);

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

  // openness is now applied server-side (see the market-dashboard fetch above),
  // so providers/movers already reflect the selected filter.
  const filteredProviders = dashboard?.providers ?? [];
  const filteredMovers = dashboard?.movers ?? [];
  const primaryChart = view === "country"
    ? <CountryChart data={dashboard?.country_trend ?? []} periodDays={days} />
    : view === "provider"
      ? <ProviderChart data={filteredProviders} />
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
          {dashboard?.benchmark.name ?? "Benchmark"} · {dashboard?.country_trend.length ?? 0} ölçüm noktası
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

      <div className={`market-chart-grid ${view === "country" ? "frontier-mode frontier-only" : ""}`}>
        <article className={`market-panel market-chart-panel ${view === "country" ? "market-frontier-panel" : ""}`}>
          <header>
            <div>
              <h3>{primaryTitle}</h3>
              <p>{primaryDescription}</p>
            </div>

            <div className="market-chart-head-actions">
              <label className="market-benchmark-picker">
                <span>Benchmark kaynağı</span>
                <select
                  value={benchmark}
                  onChange={(event) => {
                    setLoading(true);
                    setError(false);
                    setBenchmark(event.target.value);
                  }}
                  aria-label="Frontier benchmark kaynağı"
                >
                  {(benchmarkOptions.length
                    ? benchmarkOptions
                    : [{
                        slug: benchmark,
                        name: dashboard?.benchmark.name ?? benchmark,
                        snapshot_count: 0,
                        date_count: 0,
                        latest_date: null,
                      }]
                  ).map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              {view === "country" && firstGap != null && currentGap != null ? (
                <div className="market-gap-chip">
                  <strong>
                    Fark: {number.format(firstGap)} → {number.format(currentGap)}
                  </strong>
                  <small>
                    {firstCountryPoint
                      ? dateLabel(firstCountryPoint.date, days >= 365)
                      : "—"}{" "}
                    →{" "}
                    {lastCountryPoint
                      ? dateLabel(lastCountryPoint.date, days >= 365)
                      : "—"}
                  </small>
                </div>
              ) : (
                <span>Snapshot {snapshotDate}</span>
              )}
            </div>
          </header>
          {view !== "openness" && (
            <div className="market-chart-openness-filter" role="group" aria-label="Açıklık filtresi">
              <span>Açıklık</span>
              <div className="market-segmented">
                {([['all', 'Tümü'], ['open_source', 'Open Source'], ['open_weight', 'Open Weight'], ['proprietary', 'Closed Source']] as const).map(([value, label]) => (
                  <button key={value} type="button" className={opennessFilter === value ? "active" : ""} onClick={() => setOpennessFilter(value)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="market-chart-canvas">{primaryChart}</div>
          {view === "country" && lastCountryPoint && (
            <div className="market-frontier-leaders">
              <span><i className="usa" />ABD lideri <strong>{lastCountryPoint.usa_model}</strong><small>{lastCountryPoint.usa_organization}</small></span>
              <span><i className="china" />Çin lideri <strong>{lastCountryPoint.china_model}</strong><small>{lastCountryPoint.china_organization}</small></span>
              {lastCountryPoint.europe_model && (
                <span><i className="europe" />Avrupa lideri <strong>{lastCountryPoint.europe_model}</strong><small>{lastCountryPoint.europe_organization}</small></span>
              )}
              {lastCountryPoint.canada_model && (
                <span><i className="canada" />Kanada lideri <strong>{lastCountryPoint.canada_model}</strong><small>{lastCountryPoint.canada_organization}</small></span>
              )}
            </div>
          )}
          <p className="market-method">ⓘ {view === "openness" ? openness?.interpretation : dashboard?.method_note}</p>
        </article>
        {view !== "country" && (
          <article className="market-panel market-chart-panel">
            <header><div><h3>{view === "openness" ? "Ülke frontier eğilimi" : "Açıklık sınıflarının gelişimi"}</h3><p>{view === "openness" ? dashboard?.benchmark.metric : openness?.metric}</p></div><span>Canlı katalog</span></header>
            <div className="market-chart-canvas">
              {view === "openness"
                ? <CountryChart data={dashboard?.country_trend ?? []} periodDays={days} />
                : <OpennessChart data={opennessRows} />}
            </div>
            <p className="market-method">ⓘ {view === "openness" ? dashboard?.method_note : openness?.interpretation}</p>
          </article>
        )}
      </div>

      <div className="market-bottom-grid">
        <article className="market-panel market-insights">
          <header><i>◉</i><h3>Öne çıkan içgörüler</h3></header>
          <ul>{(dashboard?.insights ?? []).map((insight) => <li key={insight}><span>✓</span>{insight}</li>)}</ul>
        </article>
        <article className="market-panel market-movers">
          <header><i>⌁</i><h3>En hızlı yükselenler</h3></header>
          <ol>{filteredMovers.slice(0, 3).map((item, index) => <li key={item.model}><b>{index + 1}</b><span><strong>{item.model}</strong><small>{item.organization}</small></span><em>+{number.format(item.delta)}<small>puan</small></em></li>)}</ol>
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
