"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

import { getSessionId, trackEvent } from "../lib/analytics";

type RankedModel = { model_id: string; name: string; company: string; count: number };
type PopularData = {
  window_days: number;
  metric_note: string;
  most_viewed: RankedModel[];
  most_compared: RankedModel[];
  rising: RankedModel[];
  most_requested: { name: string; count: number }[];
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
const demandOptions = ["Qwen", "DeepSeek", "Kimi", "GLM", "Mistral"];
const feedbackOptions = [
  ["missing_model", "Eksik model"],
  ["filter_suggestion", "Filtre önerisi"],
  ["bug_report", "Hata bildirimi"],
  ["feature_request", "Özellik isteği"],
  ["general", "Genel yorum"],
];

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

export default function ProductInsights({ api }: { api: string }) {
  const [popular, setPopular] = useState<PopularData>(emptyPopular);
  const [frontier, setFrontier] = useState<FrontierData | null>(null);
  const [openness, setOpenness] = useState<OpennessData | null>(null);
  const [turkish, setTurkish] = useState<TurkishData>({ selection_note: "", items: [] });
  const [feedbackType, setFeedbackType] = useState("general");
  const [message, setMessage] = useState("");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [demand, setDemand] = useState<string[]>([]);
  const [otherModel, setOtherModel] = useState("");
  const [demandState, setDemandState] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );

  useEffect(() => {
    const optional = (url: string) => fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    void Promise.all([
      optional(`${api}/api/v1/analytics/popular?days=30&limit=8`),
      optional(`${api}/api/v1/insights/country-frontier?limit=6`),
      optional(`${api}/api/v1/insights/openness-trend`),
      optional(`${api}/api/v1/models/turkish?limit=100`),
    ]).then(([popularData, frontierData, opennessData, turkishData]) => {
      if (popularData) setPopular(popularData);
      if (frontierData) setFrontier(frontierData);
      if (opennessData) setOpenness(opennessData);
      if (turkishData) setTurkish(turkishData);
    });
  }, [api]);

  const frontierRows = useMemo(
    () =>
      (frontier?.items ?? []).map((item) => ({
        ...item,
        label: item.model.length > 24 ? `${item.model.slice(0, 22)}…` : item.model,
      })),
    [frontier],
  );

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim().length < 3 || feedbackState === "sending") return;
    setFeedbackState("sending");
    try {
      const response = await fetch(`${api}/api/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: window.crypto.randomUUID(),
          session_id: getSessionId(),
          feedback_type: feedbackType,
          message,
        }),
      });
      if (!response.ok) throw new Error("Feedback gönderilemedi");
      trackEvent(api, "feedback_submitted", { metadata: { feedback_type: feedbackType } });
      setMessage("");
      setFeedbackState("success");
    } catch {
      setFeedbackState("error");
    }
  }

  async function submitDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!demand.length && !otherModel.trim()) || demandState === "sending") return;
    setDemandState("sending");
    try {
      const response = await fetch(`${api}/api/v1/model-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: window.crypto.randomUUID(),
          session_id: getSessionId(),
          requested_models: demand,
          other_model: otherModel,
        }),
      });
      if (!response.ok) throw new Error("Talep gönderilemedi");
      trackEvent(api, "model_requested", { metadata: { requested_models: demand } });
      setDemand([]);
      setOtherModel("");
      setDemandState("success");
    } catch {
      setDemandState("error");
    }
  }

  return (
    <>
      <section className="catalog-section interest-section" id="popularity">
        <div className="section-title">
          <div>
            <p className="kicker">KULLANICI İLGİSİ</p>
            <h2>Popüler ve yükselen modeller.</h2>
          </div>
          <p>{popular.metric_note}</p>
        </div>
        <div className="interest-grid">
          <InterestList title="En çok incelenen" items={popular.most_viewed} />
          <InterestList title="En çok karşılaştırılan" items={popular.most_compared} />
          <InterestList title="Son 7 günde yükselen" items={popular.rising} />
          <InterestList title="En çok talep edilen" items={popular.most_requested} />
        </div>
      </section>

      <section className="compare-section analysis-section" id="insights">
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

      <section className="catalog-section" id="turkish">
        <div className="section-title">
          <div>
            <p className="kicker">TÜRKİYE LLM EKOSİSTEMİ</p>
            <h2>Türkçe odaklı modeller.</h2>
          </div>
          <p>{turkish.selection_note || "Kaynak etiketleriyle doğrulanan modeller."}</p>
        </div>
        {turkish.items.length ? (
          <div className="panel table-wrap rich-table">
            <table>
              <thead><tr><th>MODEL</th><th>KURULUŞ</th><th>TEMEL MODEL</th><th>PARAMETRE</th><th>LİSANS</th><th>İNDİRME</th><th>BEĞENİ</th><th>GÜNCELLEME</th></tr></thead>
              <tbody>{turkish.items.map((model) => <tr key={model.id}><td><strong>{model.name}</strong></td><td>{model.organization}</td><td>{model.base_model ?? "—"}</td><td className="mono">{compact(model.parameter_count)}</td><td>{model.license ?? "—"}</td><td className="mono">{compact(model.downloads)}</td><td className="mono">{compact(model.likes)}</td><td>{new Date(model.last_updated).toLocaleDateString("tr-TR")}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="empty-light">Doğrulanmış Türkçe/Türkiye modeli henüz katalogda bulunmuyor. Hugging Face collector’ı bu bölümü otomatik dolduracak.</div>
        )}
      </section>

      <section className="feedback-section" id="feedback">
        <div className="section-title">
          <div>
            <p className="kicker">GERİ BİLDİRİM VE LLMaaS</p>
            <h2>Eksik olanı birlikte tamamlayalım.</h2>
          </div>
          <p>Kişisel bilgi istemiyoruz; gönderimler yalnızca anonim session kimliğiyle ilişkilendirilir.</p>
        </div>
        <div className="feedback-grid">
          <form onSubmit={submitFeedback}>
            <h3>Geri bildirim gönder</h3>
            <label><span>Tür</span><select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value)}>{feedbackOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Mesaj</span><textarea value={message} minLength={3} maxLength={4000} required onChange={(event) => { setMessage(event.target.value); setFeedbackState("idle"); }} placeholder="Eksik model, hatalı fiyat veya istediğin özelliği anlat." /></label>
            <button type="submit" disabled={message.trim().length < 3 || feedbackState === "sending"}>{feedbackState === "sending" ? "Gönderiliyor…" : "Gönder"}</button>
            {feedbackState === "success" && <p className="form-success" role="status">Geri bildirimin kaydedildi.</p>}
            {feedbackState === "error" && <p className="form-error" role="alert">Gönderilemedi; lütfen tekrar dene.</p>}
          </form>
          <form onSubmit={submitDemand}>
            <h3>Hangi modeli LLMaaS olarak istersin?</h3>
            <fieldset><legend>Birden fazla seçebilirsin</legend>{demandOptions.map((model) => <label className="check-row" key={model}><input type="checkbox" checked={demand.includes(model)} onChange={() => { setDemand((current) => current.includes(model) ? current.filter((item) => item !== model) : [...current, model]); setDemandState("idle"); }} /><span>{model}</span></label>)}</fieldset>
            <label><span>Diğer</span><input value={otherModel} maxLength={200} onChange={(event) => { setOtherModel(event.target.value); setDemandState("idle"); }} placeholder="Başka bir model adı" /></label>
            <button type="submit" disabled={(!demand.length && !otherModel.trim()) || demandState === "sending"}>{demandState === "sending" ? "Kaydediliyor…" : "Talebi kaydet"}</button>
            {demandState === "success" && <p className="form-success" role="status">Model talebin kaydedildi.</p>}
            {demandState === "error" && <p className="form-error" role="alert">Talep kaydedilemedi; tekrar dene.</p>}
          </form>
        </div>
      </section>
    </>
  );
}
