"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage, type Language } from "../lib/i18n";
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

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function signed(value: number | null, locale: string, language: Language, suffix?: string): string {
  const resolvedSuffix = suffix ?? (language === "tr" ? "puan" : "pts");
  if (value == null) return language === "tr" ? "Veri yok" : "No data";
  return `${value > 0 ? "+" : ""}${formatNumber(value, locale)} ${resolvedSuffix}`;
}

function dateLabel(value: string, locale: string, includeYear = false): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: includeYear ? "2-digit" : undefined,
  }).format(new Date(`${value}T00:00:00`));
}

function axisDateLabel(value: number, periodDays: PeriodDays, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
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
  const { language, locale } = useLanguage();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const noModelInfo = language === "tr" ? "Model bilgisi yok" : "No model info";
  const usaLabel = language === "tr" ? "ABD" : "USA";
  const chinaLabel = language === "tr" ? "Çin" : "China";
  const europeLabel = language === "tr" ? "Avrupa" : "Europe";
  const canadaLabel = language === "tr" ? "Kanada" : "Canada";

  return (
    <div className="market-country-tooltip">
      <strong>{dateLabel(point.date, locale, true)}</strong>
      <div className="usa">
        <i />
        <span><b>{usaLabel} · {point.usa == null ? "—" : formatNumber(point.usa, locale)}</b><small>{point.usa_model ?? noModelInfo}{point.usa_organization ? ` · ${point.usa_organization}` : ""}</small></span>
      </div>
      <div className="china">
        <i />
        <span><b>{chinaLabel} · {point.china == null ? "—" : formatNumber(point.china, locale)}</b><small>{point.china_model ?? noModelInfo}{point.china_organization ? ` · ${point.china_organization}` : ""}</small></span>
      </div>
      {point.europe != null && (
        <div className="europe">
          <i />
          <span><b>{europeLabel} · {formatNumber(point.europe, locale)}</b><small>{point.europe_model ?? noModelInfo}{point.europe_organization ? ` · ${point.europe_organization}` : ""}</small></span>
        </div>
      )}
      {point.canada != null && (
        <div className="canada">
          <i />
          <span><b>{canadaLabel} · {formatNumber(point.canada, locale)}</b><small>{point.canada_model ?? noModelInfo}{point.canada_organization ? ` · ${point.canada_organization}` : ""}</small></span>
        </div>
      )}
    </div>
  );
}

function CountryChart({ data, periodDays }: { data: CountryPoint[]; periodDays: PeriodDays }) {
  const { language, locale } = useLanguage();

  if (!data.length) {
    return (
      <div className="market-chart-empty">
        {language === "tr" ? "Seçili dönemde ülke verisi yok." : "No country data for the selected period."}
      </div>
    );
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
      usa_end: last && point.usa != null ? formatNumber(point.usa, locale) : "",
      china_end: last && point.china != null ? formatNumber(point.china, locale) : "",
      europe_end: last && point.europe != null ? formatNumber(point.europe, locale) : "",
      canada_end: last && point.canada != null ? formatNumber(point.canada, locale) : "",
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
          tickFormatter={(value) => axisDateLabel(Number(value), periodDays, locale)}
          tick={{ fill: "#93a39a", fontSize: 10 }}
        />

        <YAxis
          domain={["dataMin - 5", "dataMax + 5"]}
          tickFormatter={(value) => formatNumber(Number(value), locale)}
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
          name={language === "tr" ? "ABD" : "USA"}
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
          name={language === "tr" ? "Çin" : "China"}
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
          name={language === "tr" ? "Avrupa" : "Europe"}
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
          name={language === "tr" ? "Kanada" : "Canada"}
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
  const { language } = useLanguage();
  const chartData = data.map((item) => ({
    ...item,
    label: item.organization.length > 18 ? `${item.organization.slice(0, 16)}…` : item.organization,
  }));
  if (!chartData.length) {
    return (
      <div className="market-chart-empty">
        {language === "tr" ? "Seçili benchmark için sağlayıcı verisi yok." : "No provider data for the selected benchmark."}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 22, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#34453e" strokeDasharray="3 4" horizontal={false} />
        <XAxis type="number" domain={["dataMin - 20", "dataMax + 10"]} tick={{ fill: "#93a39a", fontSize: 10 }} />
        <YAxis dataKey="label" type="category" width={92} tick={{ fill: "#b7c4bd", fontSize: 10 }} />
        <Tooltip contentStyle={CHART_TOOLTIP} />
        <Bar dataKey="score" name={language === "tr" ? "Skor" : "Score"} radius={[0, 4, 4, 0]} isAnimationActive={false}>
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
  const { language } = useLanguage();
  if (!data.length) {
    return (
      <div className="market-chart-empty">
        {language === "tr" ? "Yayın tarihli model verisi yok." : "No model release-date data available."}
      </div>
    );
  }
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
  const { language, locale } = useLanguage();
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
    ? new Date(`${dashboard.published_at}T00:00:00`).toLocaleDateString(locale)
    : (language === "tr" ? "Veri bekleniyor" : "Awaiting data");
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
    ? (language === "tr" ? "Çin vs ABD frontier yarışı" : "China vs USA frontier race")
    : view === "provider"
      ? (language === "tr" ? "Sağlayıcıların frontier görünümü" : "Provider frontier overview")
      : (language === "tr" ? "Açıklık sınıflarının gelişimi" : "Evolution of openness classes");
  const primaryDescription = view === "openness"
    ? openness?.metric ?? (language === "tr" ? "Katalogdaki yayınlanan model sayısı" : "Number of published models in the catalog")
    : dashboard?.benchmark.metric ?? (language === "tr" ? "Benchmark skoru — yüksek daha iyi" : "Benchmark score — higher is better");
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
          <p className="kicker">{language === "tr" ? "PAZAR ANALİZİ" : "MARKET ANALYSIS"}</p>
          <h2>{language === "tr" ? "Yarışın metriği açık." : "The race, measured."}</h2>
          <p>
            {language === "tr"
              ? "Frontier yarışını puanlar, yayın eğilimleri ve doğrulanmış katalog verileriyle izleyin."
              : "Track the frontier race with scores, release trends, and verified catalog data."}
          </p>
        </div>
        <p className="market-live-note">
          {language === "tr"
            ? (
              <>
                Grafikler statik görsel değil; güncel katalog ve benchmark snapshot’larından üretilir.
                <strong> Veriler scheduler akışıyla güncellenir.</strong>
              </>
            )
            : (
              <>
                These charts aren&apos;t static images; they&apos;re generated from live catalog and benchmark snapshots.
                <strong> Data is refreshed by the scheduler pipeline.</strong>
              </>
            )}
        </p>
      </header>

      <div className="market-controls" aria-label={language === "tr" ? "Pazar analizi filtreleri" : "Market analysis filters"}>
        <div className="market-control-group">
          <span>{language === "tr" ? "Zaman aralığı" : "Time range"}</span>
          <div className="market-segmented" role="group" aria-label={language === "tr" ? "Zaman aralığı" : "Time range"}>
            {(language === "tr"
              ? ([[30, "30G"], [90, "90G"], [365, "1Y"], [3650, "Tümü"]] as const)
              : ([[30, "30D"], [90, "90D"], [365, "1Y"], [3650, "All"]] as const)
            ).map(([value, label]) => (
              <button key={value} type="button" className={days === value ? "active" : ""} onClick={() => changeDays(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="market-control-group">
          <span>{language === "tr" ? "Görünüm" : "View"}</span>
          <div className="market-segmented" role="group" aria-label={language === "tr" ? "Grafik görünümü" : "Chart view"}>
            {(language === "tr"
              ? ([['country', 'Ülke'], ['provider', 'Sağlayıcı'], ['openness', 'Açıklık']] as const)
              : ([['country', 'Country'], ['provider', 'Provider'], ['openness', 'Openness']] as const)
            ).map(([value, label]) => (
              <button key={value} type="button" className={view === value ? "active" : ""} onClick={() => setView(value)}>{label}</button>
            ))}
          </div>
        </div>
        <p className="market-coverage-note">
          <span>{language === "tr" ? "VERİ KAPSAMI" : "DATA COVERAGE"}</span>
          {dashboard?.benchmark.name ?? "Benchmark"} · {dashboard?.country_trend.length ?? 0}{" "}
          {language === "tr" ? "ölçüm noktası" : "data points"}
        </p>
      </div>

      {error && (
        <div className="market-error">
          {language === "tr"
            ? "Canlı pazar verisi şu anda alınamadı. API bağlantısını kontrol edin."
            : "Couldn't fetch live market data right now. Please check the API connection."}
        </div>
      )}

      <div className="market-kpi-grid">
        <article>
          <i>⌁</i><div><span>{language === "tr" ? "Frontier farkı" : "Frontier gap"}</span><strong>{currentGap == null ? "—" : (language === "tr" ? `${formatNumber(currentGap, locale)} puan` : `${formatNumber(currentGap, locale)} pts`)}</strong><small>{language === "tr" ? "Çin ve ABD farkı" : "China vs USA gap"} <b className={gapDelta != null && gapDelta <= 0 ? "positive" : "negative"}>{signed(gapDelta, locale, language)}</b></small></div>
        </article>
        <article>
          <i>◔</i><div><span>{language === "tr" ? "Open-weight payı" : "Open-weight share"}</span><strong>{language === "tr" ? `%${formatNumber(dashboard?.summary.open_weight_share ?? 0, locale)}` : `${formatNumber(dashboard?.summary.open_weight_share ?? 0, locale)}%`}</strong><small><b>{formatNumber(dashboard?.summary.open_weight_models ?? 0, locale)}</b> {language === "tr" ? "doğrulanmış model" : "verified models"}</small></div>
        </article>
        <article>
          <i>✣</i><div><span>{language === "tr" ? "Bu ay yeni model" : "New models this month"}</span><strong>{formatNumber(dashboard?.summary.new_models_this_month ?? 0, locale)}</strong><small>{language === "tr" ? "Kataloğa eklenen" : "Added to catalog"} <b className={(dashboard?.summary.new_models_delta ?? 0) >= 0 ? "positive" : "negative"}>{signed(dashboard?.summary.new_models_delta ?? 0, locale, language, language === "tr" ? "önceki aya göre" : "vs last month")}</b></small></div>
        </article>
        <article>
          <i>↗</i><div><span>{language === "tr" ? "En hızlı yükselen" : "Fastest riser"}</span><strong>{riser?.model ?? "—"}</strong><small>{riser ? `${riser.organization} · ${signed(riser.delta, locale, language)}` : (language === "tr" ? "Karşılaştırılabilir snapshot bekleniyor" : "Awaiting a comparable snapshot")}</small></div>
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
                <span>{language === "tr" ? "Benchmark kaynağı" : "Benchmark source"}</span>
                <select
                  value={benchmark}
                  onChange={(event) => {
                    setLoading(true);
                    setError(false);
                    setBenchmark(event.target.value);
                  }}
                  aria-label={language === "tr" ? "Frontier benchmark kaynağı" : "Frontier benchmark source"}
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
                    {language === "tr" ? "Fark" : "Gap"}: {formatNumber(firstGap, locale)} → {formatNumber(currentGap, locale)}
                  </strong>
                  <small>
                    {firstCountryPoint
                      ? dateLabel(firstCountryPoint.date, locale, days >= 365)
                      : "—"}{" "}
                    →{" "}
                    {lastCountryPoint
                      ? dateLabel(lastCountryPoint.date, locale, days >= 365)
                      : "—"}
                  </small>
                </div>
              ) : (
                <span>Snapshot {snapshotDate}</span>
              )}
            </div>
          </header>
          {view !== "openness" && (
            <div className="market-chart-openness-filter" role="group" aria-label={language === "tr" ? "Açıklık filtresi" : "Openness filter"}>
              <span>{language === "tr" ? "Açıklık" : "Openness"}</span>
              <div className="market-segmented">
                {(language === "tr"
                  ? ([['all', 'Tümü'], ['open_source', 'Open Source'], ['open_weight', 'Open Weight'], ['proprietary', 'Closed Source']] as const)
                  : ([['all', 'All'], ['open_source', 'Open Source'], ['open_weight', 'Open Weight'], ['proprietary', 'Closed Source']] as const)
                ).map(([value, label]) => (
                  <button key={value} type="button" className={opennessFilter === value ? "active" : ""} onClick={() => setOpennessFilter(value)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="market-chart-canvas">{primaryChart}</div>
          {view === "country" && lastCountryPoint && (
            <div className="market-frontier-leaders">
              <span><i className="usa" />{language === "tr" ? "ABD lideri" : "USA leader"} <strong>{lastCountryPoint.usa_model}</strong><small>{lastCountryPoint.usa_organization}</small></span>
              <span><i className="china" />{language === "tr" ? "Çin lideri" : "China leader"} <strong>{lastCountryPoint.china_model}</strong><small>{lastCountryPoint.china_organization}</small></span>
              {lastCountryPoint.europe_model && (
                <span><i className="europe" />{language === "tr" ? "Avrupa lideri" : "Europe leader"} <strong>{lastCountryPoint.europe_model}</strong><small>{lastCountryPoint.europe_organization}</small></span>
              )}
              {lastCountryPoint.canada_model && (
                <span><i className="canada" />{language === "tr" ? "Kanada lideri" : "Canada leader"} <strong>{lastCountryPoint.canada_model}</strong><small>{lastCountryPoint.canada_organization}</small></span>
              )}
            </div>
          )}
          <p className="market-method">ⓘ {view === "openness" ? openness?.interpretation : dashboard?.method_note}</p>
        </article>
        {view !== "country" && (
          <article className="market-panel market-chart-panel">
            <header><div><h3>{view === "openness" ? (language === "tr" ? "Ülke frontier eğilimi" : "Country frontier trend") : (language === "tr" ? "Açıklık sınıflarının gelişimi" : "Evolution of openness classes")}</h3><p>{view === "openness" ? dashboard?.benchmark.metric : openness?.metric}</p></div><span>{language === "tr" ? "Canlı katalog" : "Live catalog"}</span></header>
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
          <header><i>◉</i><h3>{language === "tr" ? "Öne çıkan içgörüler" : "Key insights"}</h3></header>
          <ul>{(dashboard?.insights ?? []).map((insight) => <li key={insight}><span>✓</span>{insight}</li>)}</ul>
        </article>
        <article className="market-panel market-movers">
          <header><i>⌁</i><h3>{language === "tr" ? "En hızlı yükselenler" : "Fastest risers"}</h3></header>
          <ol>{filteredMovers.slice(0, 3).map((item, index) => <li key={item.model}><b>{index + 1}</b><span><strong>{item.model}</strong><small>{item.organization}</small></span><em>+{formatNumber(item.delta, locale)}<small>{language === "tr" ? "puan" : "pts"}</small></em></li>)}</ol>
        </article>
        <article className="market-panel market-snapshot">
          <header><i>▥</i><h3>{language === "tr" ? "Pazar özeti" : "Market snapshot"}</h3></header>
          <dl>
            <div><dt>{language === "tr" ? "Toplam model" : "Total models"}</dt><dd>{formatNumber(dashboard?.summary.total_models ?? 0, locale)}</dd></div>
            <div><dt>{language === "tr" ? "Aktif fiyat sağlayıcısı" : "Active pricing providers"}</dt><dd>{formatNumber(dashboard?.summary.active_providers ?? 0, locale)}</dd></div>
            <div><dt>{language === "tr" ? "Open-weight model" : "Open-weight models"}</dt><dd>{formatNumber(dashboard?.summary.open_weight_models ?? 0, locale)}</dd></div>
          </dl>
        </article>
        <article className="market-panel market-actions">
          <header><i>◎</i><h3>{language === "tr" ? "Harekete geçin" : "Take action"}</h3></header>
          <button type="button" className="primary" onClick={() => onNavigate("leaderboard")}>{language === "tr" ? "Frontier modelleri incele" : "Explore frontier models"} <span>›</span></button>
          <button type="button" onClick={onOpenWeight}>{language === "tr" ? "Open-weight filtrele" : "Filter open-weight"} <span>›</span></button>
          <button type="button" className="violet" onClick={() => onNavigate("compare")}>{language === "tr" ? "Karşılaştır" : "Compare"} <span>›</span></button>
        </article>
      </div>
    </section>
  );
}
