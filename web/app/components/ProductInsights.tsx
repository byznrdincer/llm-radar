"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
type FrontierData = {
  benchmark: string;
  metric: string;
  published_at: string | null;
  items: { region: "USA" | "China"; model: string; organization: string; score: number }[];
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
type TurkishModel = {
  id: string;
  name: string;
  organization: string;
  base_model: string | null;
  parameter_count: number | null;
  license: string | null;
  downloads: number | null;
  likes: number | null;
  benchmark_score: number | null;
  last_updated: string;
};
type TurkishData = { selection_note: string; items: TurkishModel[] };

const emptyPopular: PopularData = {
  window_days: 30,
  metric_note: "Kullanıcı ilgisini gösterir; model kalitesi değildir.",
  most_viewed: [],
  most_compared: [],
  rising: [],
  most_requested: [],
};

const TURKISH_PAGE_SIZE = 10;

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

export default function ProductInsights({ api, view }: { api: string; view: InsightsView }) {
  const [popular, setPopular] = useState<PopularData>(emptyPopular);
  const [popularDays, setPopularDays] = useState<1 | 7 | 30 | 365>(7);
  const [showCalculation, setShowCalculation] = useState(false);
  const [spotlightPeriod, setSpotlightPeriod] = useState<"week" | "month" | "year">("week");
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [frontier, setFrontier] = useState<FrontierData | null>(null);
  const [openness, setOpenness] = useState<OpennessData | null>(null);
  const [turkish, setTurkish] = useState<TurkishData>({ selection_note: "", items: [] });
  const [turkishPage, setTurkishPage] = useState(1);

  useEffect(() => {
    setTurkishPage(1);
  }, [turkish.items.length]);

  const turkishPages = Math.max(1, Math.ceil(turkish.items.length / TURKISH_PAGE_SIZE));
  const visibleTurkish = useMemo(
    () =>
      turkish.items.slice(
        (turkishPage - 1) * TURKISH_PAGE_SIZE,
        turkishPage * TURKISH_PAGE_SIZE,
      ),
    [turkish.items, turkishPage],
  );

  useEffect(() => {
    if (turkishPage > turkishPages) setTurkishPage(turkishPages);
  }, [turkishPage, turkishPages]);

  useEffect(() => {
    const optional = (url: string) => fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    void Promise.all([
      optional(`${api}/api/v1/analytics/popular?days=${popularDays}&limit=8`),
      optional(`${api}/api/v1/analytics/spotlight?period=${spotlightPeriod}&limit=5`),
      optional(`${api}/api/v1/insights/country-frontier?limit=6`),
      optional(`${api}/api/v1/insights/openness-trend`),
      optional(`${api}/api/v1/models/turkish?limit=100`),
    ]).then(([popularData, spotlightData, frontierData, opennessData, turkishData]) => {
      if (popularData) setPopular(popularData);
      if (spotlightData) setSpotlight(spotlightData);
      if (frontierData) setFrontier(frontierData);
      if (opennessData) setOpenness(opennessData);
      if (turkishData) setTurkish(turkishData);
    });
  }, [api, spotlightPeriod, popularDays]);

  const frontierRows = useMemo(
    () =>
      (frontier?.items ?? []).map((item) => ({
        ...item,
        label: item.model.length > 24 ? `${item.model.slice(0, 22)}…` : item.model,
      })),
    [frontier],
  );

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
      <section className="compare-section analysis-section app-page" id="insights">
        <div className="section-title">
          <div>
            <p className="kicker">PAZAR ANALİZİ</p>
            <h2>Yarışın metriği açık.</h2>
          </div>
          <p>Grafikler statik görsel değil; güncel katalog ve benchmark snapshot’larından üretilir.</p>
        </div>
        <div className="analysis-grid">
          <article className="analysis-chart">
            <header>
              <div>
                <h3>China vs USA LLM Frontier</h3>
                <p>{frontier?.metric ?? "Arena Rating"}</p>
              </div>
              <small>{frontier?.published_at ? new Date(frontier.published_at).toLocaleDateString("tr-TR") : "Veri bekleniyor"}</small>
            </header>
            <div className="insight-chart-canvas">
              {frontierRows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={frontierRows} layout="vertical" margin={{ left: 30, right: 18 }}>
                    <CartesianGrid stroke="#3b4741" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#aeb8b3", fontSize: 10 }} />
                    <YAxis dataKey="label" type="category" width={125} tick={{ fill: "#dfe7e1", fontSize: 9 }} />
                    <Tooltip />
                    <Bar dataKey="score" name="Arena Rating" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                      {frontierRows.map((item) => (
                        <Cell key={`${item.region}-${item.model}`} fill={item.region === "USA" ? "#baff2a" : "#54b9aa"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">Arena snapshot’ı geldikten sonra oluşacak.</div>
              )}
            </div>
            <div className="chart-key"><span><i className="usa" /> ABD</span><span><i className="china" /> Çin</span></div>
          </article>

          <article className="analysis-chart">
            <header>
              <div>
                <h3>Açıklık sınıflarının gelişimi</h3>
                <p>{openness?.metric ?? "Katalog model sayısı"}</p>
              </div>
            </header>
            <div className="insight-chart-canvas">
              {openness?.items.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={openness.items} margin={{ top: 10, right: 15, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#3b4741" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: "#aeb8b3", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#aeb8b3", fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line dataKey="open_source" name="Open Source" stroke="#baff2a" strokeWidth={3} dot={false} />
                    <Line dataKey="open_weight" name="Open Weight" stroke="#54b9aa" strokeWidth={3} dot={false} />
                    <Line dataKey="proprietary" name="Proprietary" stroke="#a990e6" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">Yayın tarihi olan modeller geldikçe oluşacak.</div>
              )}
            </div>
            <p className="chart-disclaimer">{openness?.interpretation}</p>
          </article>
        </div>
      </section>
      )}

      {view === "turkish" && (
      <section className="catalog-section app-page" id="turkish">
        <div className="section-title">
          <div>
            <p className="kicker">TÜRKİYE LLM EKOSİSTEMİ</p>
            <h2>Türkçe odaklı modeller.</h2>
          </div>
          <p>
            {turkish.selection_note || "Kaynak etiketleriyle doğrulanan modeller."}
            {turkish.items.length > 0 && (
              <> · <strong>{turkish.items.length}</strong> model</>
            )}
          </p>
        </div>
        {turkish.items.length ? (
          <>
            <div className="panel table-wrap rich-table">
              <table>
                <thead>
                  <tr>
                    <th>MODEL</th>
                    <th>KURULUŞ</th>
                    <th>TEMEL MODEL</th>
                    <th>PARAMETRE</th>
                    <th>LİSANS</th>
                    <th>İNDİRME</th>
                    <th>BEĞENİ</th>
                    <th>BENCHMARK</th>
                    <th>GÜNCELLEME</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTurkish.map((model) => (
                    <tr key={model.id}>
                      <td><strong>{model.name}</strong></td>
                      <td>{model.organization}</td>
                      <td>{model.base_model ?? "—"}</td>
                      <td className="mono">{compact(model.parameter_count)}</td>
                      <td>{model.license ?? "—"}</td>
                      <td className="mono">{compact(model.downloads)}</td>
                      <td className="mono">{compact(model.likes)}</td>
                      <td className="mono">
                        {model.benchmark_score != null ? `%${model.benchmark_score}` : "—"}
                      </td>
                      <td>{new Date(model.last_updated).toLocaleDateString("tr-TR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {turkishPages > 1 && (
              <div className="pagination turkish-pagination">
                <button
                  type="button"
                  disabled={turkishPage === 1}
                  onClick={() => setTurkishPage((current) => current - 1)}
                >
                  ← Önceki
                </button>
                <span>
                  Sayfa {turkishPage} / {turkishPages}
                </span>
                <button
                  type="button"
                  disabled={turkishPage === turkishPages}
                  onClick={() => setTurkishPage((current) => current + 1)}
                >
                  Sonraki →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-light">
            Doğrulanmış Türkçe/Türkiye modeli henüz katalogda bulunmuyor. Hugging Face collector’ı
            bu bölümü otomatik dolduracak.
          </div>
        )}
      </section>
      )}
    </>
  );
}
