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
      <h3>{title}</h3>
      {items.length ? (
        <ol>
          {items.slice(0, 5).map((item) => (
            <li key={item.name}>
              <span>{item.name}</span>
              <strong>{item.count}</strong>
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
      optional(`${api}/api/v1/analytics/popular?days=30&limit=8`),
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
  }, [api, spotlightPeriod]);

  const frontierRows = useMemo(
    () =>
      (frontier?.items ?? []).map((item) => ({
        ...item,
        label: item.model.length > 24 ? `${item.model.slice(0, 22)}…` : item.model,
      })),
    [frontier],
  );

  return (
    <>
      {view === "popularity" && (
      <section className="catalog-section interest-section app-page" id="popularity">
        <div className="section-title">
          <div>
            <p className="kicker">KULLANICI İLGİSİ</p>
            <h2>Popüler ve yükselen modeller.</h2>
          </div>
          <p>{popular.metric_note}</p>
        </div>
        <div className="spotlight-toolbar">
          <label>
            <span>ÖNE ÇIKAN DÖNEM</span>
            <select
              value={spotlightPeriod}
              onChange={(event) =>
                setSpotlightPeriod(event.target.value as "week" | "month" | "year")
              }
            >
              <option value="week">Haftanın modeli</option>
              <option value="month">Ayın modeli</option>
              <option value="year">Yılın modeli</option>
            </select>
          </label>
          <p>{spotlight?.metric_note ?? "Etkileşim verisi geldikçe güncellenir."}</p>
        </div>
        <div className="interest-grid">
          <InterestList
            title={spotlight?.label ?? "Öne çıkan modeller"}
            items={spotlight?.items ?? []}
          />
          <InterestList title="En çok incelenen" items={popular.most_viewed} />
          <InterestList title="En çok karşılaştırılan" items={popular.most_compared} />
          <InterestList title="Son 7 günde yükselen" items={popular.rising} />
          <InterestList title="En çok talep edilen" items={popular.most_requested} />
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
