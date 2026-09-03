"use client";

import { useEffect, useState } from "react";
import MarketAnalysisDashboard from "./MarketAnalysisDashboard";
import TurkishLLMPage, { type TurkishModel } from "./TurkishLLMPage";
import { useLanguage, type Language } from "../lib/i18n";

type RankedModel = { model_id: string; name: string; company: string; count: number };
type PopularData = {
  window_days: number;
  metric_note: string;
  most_viewed: RankedModel[];
  most_compared: RankedModel[];
  rising: RankedModel[];
  most_requested: { name: string; count: number }[];
};
type SpotlightData = {
  period: "week" | "month" | "year";
  window_days: number;
  label: string;
  metric_note: string;
  items: RankedModel[];
};

const DEFAULT_METRIC_NOTE: Record<Language, string> = {
  tr: "Kullanıcı ilgisini gösterir; model kalitesi değildir.",
  en: "Reflects user interest, not model quality.",
};

const emptyPopular: PopularData = {
  window_days: 30,
  metric_note: DEFAULT_METRIC_NOTE.tr,
  most_viewed: [],
  most_compared: [],
  rising: [],
  most_requested: [],
};

function compact(value: number | null, locale: string): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

const INTEREST_LIST_STRINGS: Record<Language, { viewAll: string; empty: string }> = {
  tr: { viewAll: "Tümünü gör", empty: "İlk etkileşimler geldikçe burada görünecek." },
  en: { viewAll: "View all", empty: "This will populate as interactions come in." },
};

function InterestList({ title, items }: { title: string; items: { name: string; count: number }[] }) {
  const { language } = useLanguage();
  const strings = INTEREST_LIST_STRINGS[language];
  return (
    <article className="interest-card">
      <header><h3>{title}</h3><span>{strings.viewAll}</span></header>
      {items.length ? (
        <ol>
          {items.slice(0, 10).map((item, index) => (
            <li key={item.name}>
              <b>{index + 1}</b>
              <span>{item.name}</span>
              <strong>{item.count} <i>↑</i></strong>
            </li>
          ))}
        </ol>
      ) : (
        <p>{strings.empty}</p>
      )}
    </article>
  );
}

export type InsightsView = "popularity" | "insights" | "turkish";

type Props = {
  api: string;
  view: InsightsView;
  onNavigate: (section: string) => void;
  onOpenWeight: () => void;
  turkishBootstrap?: TurkishModel[] | null;
};

const STRINGS: Record<Language, {
  kicker: string;
  heading: string;
  periodGroupLabel: string;
  periods: [1 | 7 | 30 | 365, string, "week" | "month" | "year"][];
  totalViews: string;
  totalComparisons: string;
  totalRequests: string;
  interactionScore: string;
  activeModels: string;
  modelOfTheDay: string;
  featuredModel: string;
  waitingForData: string;
  waitingForDataDescription: string;
  spotlightTagPopular: string;
  spotlightTagRising: string;
  spotlightTagInterest: string;
  interaction: string;
  views: string;
  comparisons: string;
  mostViewed: string;
  mostCompared: string;
  rising: (days: number) => string;
  mostRequested: string;
  featuredSignals: string;
  liveData: string;
  dataPending: string;
  interactionDistribution: string;
  daySuffix: (days: number) => string;
  requests: string;
  dataScope: string;
  transparentMetric: string;
  today: string;
  lastNDays: (days: number) => string;
  scopeDescription: string;
  activeModelsLabel: string;
  interactionScoreLabel: string;
  calculationMethod: string;
  calculationMethodSubtitle: string;
  stepViews: string;
  stepViewsDescription: string;
  stepComparisons: string;
  stepComparisonsDescription: string;
  stepRequests: string;
  stepRequestsDescription: string;
  interactionScoreCaps: string;
  formula: string;
  formulaDescription: string;
}> = {
  tr: {
    kicker: "KULLANICI İLGİSİ",
    heading: "Popüler ve yükselen modeller",
    periodGroupLabel: "İlgi dönemi",
    periods: [
      [1, "Gün", "week"],
      [7, "Hafta", "week"],
      [30, "Ay", "month"],
      [365, "Yıl", "year"],
    ],
    totalViews: "Toplam görüntülenme",
    totalComparisons: "Toplam karşılaştırma",
    totalRequests: "Toplam talep",
    interactionScore: "Etkileşim skoru",
    activeModels: "Etkileşim alan model",
    modelOfTheDay: "Günün modeli",
    featuredModel: "Öne çıkan model",
    waitingForData: "Etkileşim verisi bekleniyor",
    waitingForDataDescription: "Model verileri güncellendikçe burada gösterilecek.",
    spotlightTagPopular: "Popüler",
    spotlightTagRising: "Yükselen",
    spotlightTagInterest: "Kullanıcı ilgisi",
    interaction: "Etkileşim",
    views: "Görüntülenme",
    comparisons: "Karşılaştırma",
    mostViewed: "En çok incelenen",
    mostCompared: "En çok karşılaştırılan",
    rising: (days) => `Son ${days} günde yükselen`,
    mostRequested: "En çok talep edilen",
    featuredSignals: "Öne çıkan sinyaller",
    liveData: "Canlı veri",
    dataPending: "Veri bekleniyor",
    interactionDistribution: "Etkileşim dağılımı",
    daySuffix: (days) => `${days} günlük`,
    requests: "Talep",
    dataScope: "Veri kapsamı",
    transparentMetric: "Şeffaf metrik",
    today: "Bugün",
    lastNDays: (days) => `Son ${days} gün`,
    scopeDescription: "Model ilgisi görüntülenme, karşılaştırma ve kullanıcı taleplerinden hesaplanır. Model kalitesi anlamına gelmez.",
    activeModelsLabel: "aktif model",
    interactionScoreLabel: "etkileşim skoru",
    calculationMethod: "Hesaplama yöntemi",
    calculationMethodSubtitle: "Sıralamaların hangi sinyallerden oluştuğunu inceleyin.",
    stepViews: "Görüntülenme",
    stepViewsDescription: "Model detay sayfasının açılma sayısı",
    stepComparisons: "Karşılaştırma",
    stepComparisonsDescription: "Modelin karşılaştırmaya eklenme sayısı",
    stepRequests: "Talep",
    stepRequestsDescription: "Kullanıcıların oluşturduğu model talepleri",
    interactionScoreCaps: "ETKİLEŞİM SKORU",
    formula: "Görüntülenme + Karşılaştırma × 2 + Talep × 2",
    formulaDescription: "Bu skor kullanıcı ilgisini ölçer; model kalitesi veya benchmark başarısı anlamına gelmez.",
  },
  en: {
    kicker: "USER INTEREST",
    heading: "Popular and rising models",
    periodGroupLabel: "Interest period",
    periods: [
      [1, "Day", "week"],
      [7, "Week", "week"],
      [30, "Month", "month"],
      [365, "Year", "year"],
    ],
    totalViews: "Total views",
    totalComparisons: "Total comparisons",
    totalRequests: "Total requests",
    interactionScore: "Interaction score",
    activeModels: "Models with interaction",
    modelOfTheDay: "Model of the day",
    featuredModel: "Featured model",
    waitingForData: "Waiting for interaction data",
    waitingForDataDescription: "This will show up here as model data updates.",
    spotlightTagPopular: "Popular",
    spotlightTagRising: "Rising",
    spotlightTagInterest: "User interest",
    interaction: "Interaction",
    views: "Views",
    comparisons: "Comparisons",
    mostViewed: "Most viewed",
    mostCompared: "Most compared",
    rising: (days) => `Rising in the last ${days} days`,
    mostRequested: "Most requested",
    featuredSignals: "Featured signals",
    liveData: "Live data",
    dataPending: "Data pending",
    interactionDistribution: "Interaction distribution",
    daySuffix: (days) => `${days}-day`,
    requests: "Requests",
    dataScope: "Data scope",
    transparentMetric: "Transparent metric",
    today: "Today",
    lastNDays: (days) => `Last ${days} days`,
    scopeDescription: "Model interest is calculated from views, comparisons, and user requests. It does not reflect model quality.",
    activeModelsLabel: "active models",
    interactionScoreLabel: "interaction score",
    calculationMethod: "Calculation method",
    calculationMethodSubtitle: "See which signals make up the rankings.",
    stepViews: "Views",
    stepViewsDescription: "Number of times the model detail page was opened",
    stepComparisons: "Comparisons",
    stepComparisonsDescription: "Number of times the model was added to a comparison",
    stepRequests: "Requests",
    stepRequestsDescription: "Model requests created by users",
    interactionScoreCaps: "INTERACTION SCORE",
    formula: "Views + Comparisons × 2 + Requests × 2",
    formulaDescription: "This score measures user interest; it does not reflect model quality or benchmark performance.",
  },
};

export default function ProductInsights({ api, view, onNavigate, onOpenWeight, turkishBootstrap = null }: Props) {
  const { language, locale } = useLanguage();
  const t = STRINGS[language];
  const [popular, setPopular] = useState<PopularData>(emptyPopular);
  const [popularDays, setPopularDays] = useState<1 | 7 | 30 | 365>(7);
  const [showCalculation, setShowCalculation] = useState(false);
  const [spotlightPeriod, setSpotlightPeriod] = useState<"week" | "month" | "year">("week");
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);

  useEffect(() => {
    const optional = (url: string) => fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (view === "popularity") {
      void Promise.all([
        optional(`${api}/api/v1/analytics/popular?days=${popularDays}&limit=10`),
        optional(`${api}/api/v1/analytics/spotlight?period=${spotlightPeriod}&limit=5`),
      ]).then(([popularData, spotlightData]) => {
        if (popularData) setPopular(popularData);
        if (spotlightData) setSpotlight(spotlightData);
      });
    }
  }, [api, spotlightPeriod, popularDays, view]);

  const spotlightModel = popularDays === 1
    ? (popular.most_viewed[0] ?? null)
    : (spotlight?.items[0] ?? null);
  const totalViews = popular.most_viewed.reduce((sum, item) => sum + item.count, 0);
  const totalComparisons = popular.most_compared.reduce((sum, item) => sum + item.count, 0);
  const totalRequests = popular.most_requested.reduce((sum, item) => sum + item.count, 0);
  const interactionScore = totalViews + totalComparisons * 2 + totalRequests * 2;
  const activeModels = new Set([
    ...popular.most_viewed.map(item => item.name),
    ...popular.most_compared.map(item => item.name),
    ...popular.most_requested.map(item => item.name),
  ]).size;
  const distributionMax = Math.max(totalViews, totalComparisons, totalRequests, 1);

  return (
    <>
      {view === "popularity" && (
      <section className="catalog-section interest-section app-page" id="popularity">
        <div className="section-title popularity-title">
          <div>
            <p className="kicker">{t.kicker}</p>
            <h2>{t.heading}</h2>
          </div>
          <p>{language === "tr" ? popular.metric_note : DEFAULT_METRIC_NOTE.en}</p>
        </div>
        <div className="popularity-periods" role="group" aria-label={t.periodGroupLabel}>
          {t.periods.map(([days, label, period]) => (
            <button
              key={days}
              type="button"
              className={popularDays === days ? "active" : ""}
              onClick={() => { setPopularDays(days); setSpotlightPeriod(period); }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="popularity-metrics">
          <article><span className="metric-icon green">◎</span><div><small>{t.totalViews}</small><strong>{compact(totalViews, locale)}</strong></div></article>
          <article><span className="metric-icon violet">⇄</span><div><small>{t.totalComparisons}</small><strong>{compact(totalComparisons, locale)}</strong></div></article>
          <article><span className="metric-icon amber">♨</span><div><small>{t.totalRequests}</small><strong>{compact(totalRequests, locale)}</strong></div></article>
          <article><span className="metric-icon blue">↗</span><div><small>{t.interactionScore}</small><strong>{compact(interactionScore, locale)}</strong></div></article>
          <article><span className="metric-icon neutral">◉</span><div><small>{t.activeModels}</small><strong>{compact(activeModels, locale)}</strong></div></article>
        </div>

        <div className="popularity-feature-grid">
          <article className="spotlight-feature">
            <div className="spotlight-feature-top"><span>♛ &nbsp;{popularDays === 1 ? t.modelOfTheDay : (spotlight?.label ?? t.featuredModel)}</span><b>#1</b></div>
            <h3>{spotlightModel?.name ?? t.waitingForData}</h3>
            <p>{spotlightModel?.company ?? t.waitingForDataDescription}</p>
            <div className="spotlight-tags"><span>{t.spotlightTagPopular}</span><span>{t.spotlightTagRising}</span><span>{t.spotlightTagInterest}</span></div>
            <div className="spotlight-stats">
              <div><small>{t.interaction}</small><strong>{compact(spotlightModel?.count ?? 0, locale)}</strong></div>
              <div><small>{t.views}</small><strong>{compact(popular.most_viewed.find(item => item.name === spotlightModel?.name)?.count ?? 0, locale)}</strong></div>
              <div><small>{t.comparisons}</small><strong>{compact(popular.most_compared.find(item => item.name === spotlightModel?.name)?.count ?? 0, locale)}</strong></div>
            </div>
          </article>
          <InterestList title={t.mostViewed} items={popular.most_viewed} />
        </div>

        <div className="interest-grid">
          <InterestList title={t.mostCompared} items={popular.most_compared} />
          <InterestList title={t.rising(popularDays)} items={popular.rising} />
          <InterestList title={t.mostRequested} items={popular.most_requested} />
        </div>

        <div className="popularity-analysis-grid">
          <article className="popularity-analysis-card">
            <header><h3>{t.featuredSignals}</h3><span>{t.liveData}</span></header>
            <ul className="signal-list">
              <li><b>↗</b><div><strong>{t.mostViewed}</strong><span>{popular.most_viewed[0]?.name ?? t.dataPending}</span></div></li>
              <li><b>⇄</b><div><strong>{t.mostCompared}</strong><span>{popular.most_compared[0]?.name ?? t.dataPending}</span></div></li>
              <li><b>＋</b><div><strong>{t.mostRequested}</strong><span>{popular.most_requested[0]?.name ?? t.dataPending}</span></div></li>
            </ul>
          </article>

          <article className="popularity-analysis-card">
            <header><h3>{t.interactionDistribution}</h3><span>{t.daySuffix(popularDays)}</span></header>
            <div className="distribution-bars">
              {[
                [t.views, totalViews],
                [t.comparisons, totalComparisons],
                [t.requests, totalRequests],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <i><b style={{ width: `${(Number(value) / distributionMax) * 100}%` }} /></i>
                  <strong>{compact(Number(value), locale)}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="popularity-analysis-card data-scope-card">
            <header><h3>{t.dataScope}</h3><span>{t.transparentMetric}</span></header>
            <strong>{popularDays === 1 ? t.today : t.lastNDays(popularDays)}</strong>
            <p>{t.scopeDescription}</p>
            <div className="scope-stats">
              <span><b>{activeModels}</b><small>{t.activeModelsLabel}</small></span>
              <span><b>{compact(interactionScore, locale)}</b><small>{t.interactionScoreLabel}</small></span>
            </div>
          </article>
        </div>

        <div className={`calculation-method${showCalculation ? " open" : ""}`}>
          <button
            type="button"
            className="calculation-method-trigger"
            aria-expanded={showCalculation}
            onClick={() => setShowCalculation(value => !value)}
          >
            <span className="calculation-method-icon">i</span>
            <span><strong>{t.calculationMethod}</strong><small>{t.calculationMethodSubtitle}</small></span>
            <b>{showCalculation ? "−" : "+"}</b>
          </button>
          {showCalculation && (
            <div className="calculation-method-body">
              <div className="calculation-steps">
                <article><b>01</b><span><strong>{t.stepViews}</strong><small>{t.stepViewsDescription}</small></span><em>1×</em></article>
                <article><b>02</b><span><strong>{t.stepComparisons}</strong><small>{t.stepComparisonsDescription}</small></span><em>2×</em></article>
                <article><b>03</b><span><strong>{t.stepRequests}</strong><small>{t.stepRequestsDescription}</small></span><em>2×</em></article>
              </div>
              <div className="calculation-formula">
                <span>{t.interactionScoreCaps}</span>
                <strong>{t.formula}</strong>
                <p>{t.formulaDescription}</p>
              </div>
            </div>
          )}
        </div>

      </section>
      )}

      {view === "insights" && (
      <MarketAnalysisDashboard api={api} onNavigate={onNavigate} onOpenWeight={onOpenWeight} />
      )}

      {view === "turkish" && (
      <TurkishLLMPage api={api} bootstrap={turkishBootstrap} />
      )}
    </>
  );
}
