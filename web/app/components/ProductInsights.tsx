"use client";

import { useEffect, useState } from "react";
import MarketAnalysisDashboard from "./MarketAnalysisDashboard";
import TurkishLLMPage, { type TurkishModel } from "./TurkishLLMPage";

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

const emptyPopular: PopularData = {
  window_days: 30,
  metric_note: "Kullanıcı ilgisini gösterir; model kalitesi değildir.",
  most_viewed: [],
  most_compared: [],
  rising: [],
  most_requested: [],
};

function compact(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function InterestList({ title, items }: { title: string; items: { name: string; count: number }[] }) {
  return (
    <article className="interest-card">
      <header><h3>{title}</h3><span>Tümünü gör</span></header>
      {items.length ? (
        <ol>
          {items.slice(0, 5).map((item, index) => (
            <li key={item.name}>
              <b>{index + 1}</b>
              <span>{item.name}</span>
              <strong>{item.count} <i>↑</i></strong>
            </li>
          ))}
        </ol>
      ) : (
        <p>İlk etkileşimler geldikçe burada görünecek.</p>
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

export default function ProductInsights({ api, view, onNavigate, onOpenWeight, turkishBootstrap = null }: Props) {
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
        optional(`${api}/api/v1/analytics/popular?days=${popularDays}&limit=8`),
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
            <p className="kicker">KULLANICI İLGİSİ</p>
            <h2>Popüler ve yükselen modeller</h2>
          </div>
          <p>{popular.metric_note}</p>
        </div>
        <div className="popularity-periods" role="group" aria-label="İlgi dönemi">
          {([
            [1, "Gün", "week"],
            [7, "Hafta", "week"],
            [30, "Ay", "month"],
            [365, "Yıl", "year"],
          ] as const).map(([days, label, period]) => (
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
          <article><span className="metric-icon green">◎</span><div><small>Toplam görüntülenme</small><strong>{compact(totalViews)}</strong></div></article>
          <article><span className="metric-icon violet">⇄</span><div><small>Toplam karşılaştırma</small><strong>{compact(totalComparisons)}</strong></div></article>
          <article><span className="metric-icon amber">♨</span><div><small>Toplam talep</small><strong>{compact(totalRequests)}</strong></div></article>
          <article><span className="metric-icon blue">↗</span><div><small>Etkileşim skoru</small><strong>{compact(interactionScore)}</strong></div></article>
          <article><span className="metric-icon neutral">◉</span><div><small>Etkileşim alan model</small><strong>{compact(activeModels)}</strong></div></article>
        </div>

        <div className="popularity-feature-grid">
          <article className="spotlight-feature">
            <div className="spotlight-feature-top"><span>♛ &nbsp;{popularDays === 1 ? "Günün modeli" : (spotlight?.label ?? "Öne çıkan model")}</span><b>#1</b></div>
            <h3>{spotlightModel?.name ?? "Etkileşim verisi bekleniyor"}</h3>
            <p>{spotlightModel?.company ?? "Model verileri güncellendikçe burada gösterilecek."}</p>
            <div className="spotlight-tags"><span>Popüler</span><span>Yükselen</span><span>Kullanıcı ilgisi</span></div>
            <div className="spotlight-stats">
              <div><small>Etkileşim</small><strong>{compact(spotlightModel?.count ?? 0)}</strong></div>
              <div><small>Görüntülenme</small><strong>{compact(popular.most_viewed.find(item => item.name === spotlightModel?.name)?.count ?? 0)}</strong></div>
              <div><small>Karşılaştırma</small><strong>{compact(popular.most_compared.find(item => item.name === spotlightModel?.name)?.count ?? 0)}</strong></div>
            </div>
          </article>
          <InterestList title="En çok incelenen" items={popular.most_viewed} />
        </div>

        <div className="interest-grid">
          <InterestList title="En çok karşılaştırılan" items={popular.most_compared} />
          <InterestList title={`Son ${popularDays} günde yükselen`} items={popular.rising} />
          <InterestList title="En çok talep edilen" items={popular.most_requested} />
        </div>

        <div className="popularity-analysis-grid">
          <article className="popularity-analysis-card">
            <header><h3>Öne çıkan sinyaller</h3><span>Canlı veri</span></header>
            <ul className="signal-list">
              <li><b>↗</b><div><strong>En çok görüntülenen</strong><span>{popular.most_viewed[0]?.name ?? "Veri bekleniyor"}</span></div></li>
              <li><b>⇄</b><div><strong>En çok karşılaştırılan</strong><span>{popular.most_compared[0]?.name ?? "Veri bekleniyor"}</span></div></li>
              <li><b>＋</b><div><strong>En çok talep edilen</strong><span>{popular.most_requested[0]?.name ?? "Veri bekleniyor"}</span></div></li>
            </ul>
          </article>

          <article className="popularity-analysis-card">
            <header><h3>Etkileşim dağılımı</h3><span>{popularDays} günlük</span></header>
            <div className="distribution-bars">
              {[
                ["Görüntülenme", totalViews],
                ["Karşılaştırma", totalComparisons],
                ["Talep", totalRequests],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <i><b style={{ width: `${(Number(value) / distributionMax) * 100}%` }} /></i>
                  <strong>{compact(Number(value))}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="popularity-analysis-card data-scope-card">
            <header><h3>Veri kapsamı</h3><span>Şeffaf metrik</span></header>
            <strong>{popularDays === 1 ? "Bugün" : `Son ${popularDays} gün`}</strong>
            <p>Model ilgisi görüntülenme, karşılaştırma ve kullanıcı taleplerinden hesaplanır. Model kalitesi anlamına gelmez.</p>
            <div className="scope-stats">
              <span><b>{activeModels}</b><small>aktif model</small></span>
              <span><b>{compact(interactionScore)}</b><small>etkileşim skoru</small></span>
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
            <span><strong>Hesaplama yöntemi</strong><small>Sıralamaların hangi sinyallerden oluştuğunu inceleyin.</small></span>
            <b>{showCalculation ? "−" : "+"}</b>
          </button>
          {showCalculation && (
            <div className="calculation-method-body">
              <div className="calculation-steps">
                <article><b>01</b><span><strong>Görüntülenme</strong><small>Model detay sayfasının açılma sayısı</small></span><em>1×</em></article>
                <article><b>02</b><span><strong>Karşılaştırma</strong><small>Modelin karşılaştırmaya eklenme sayısı</small></span><em>2×</em></article>
                <article><b>03</b><span><strong>Talep</strong><small>Kullanıcıların oluşturduğu model talepleri</small></span><em>2×</em></article>
              </div>
              <div className="calculation-formula">
                <span>ETKİLEŞİM SKORU</span>
                <strong>Görüntülenme + Karşılaştırma × 2 + Talep × 2</strong>
                <p>Bu skor kullanıcı ilgisini ölçer; model kalitesi veya benchmark başarısı anlamına gelmez.</p>
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
