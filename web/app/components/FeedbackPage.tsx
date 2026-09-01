"use client";

import { FormEvent, useState } from "react";

import { getSessionId, trackEvent } from "../lib/analytics";

const feedbackOptions = [
  ["missing_model", "Eksik model"],
  ["filter_suggestion", "Filtre önerisi"],
  ["bug_report", "Hata bildirimi"],
  ["feature_request", "Özellik isteği"],
  ["general", "Genel yorum"],
] as const;

const demandOptions = ["Qwen", "DeepSeek", "Kimi", "GLM", "Mistral"];

type FormState = "idle" | "sending" | "success" | "error";

export default function FeedbackPage({ api }: { api: string }) {
  const [feedbackType, setFeedbackType] = useState("general");
  const [message, setMessage] = useState("");
  const [feedbackState, setFeedbackState] = useState<FormState>("idle");
  const [demand, setDemand] = useState<string[]>([]);
  const [otherModel, setOtherModel] = useState("");
  const [demandState, setDemandState] = useState<FormState>("idle");

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
    <section className="feedback-page" id="feedback">
      <div className="feedback-hero">
        <p className="kicker">İLETİŞİM VE KATKI</p>
        <h2>Radar’ı birlikte geliştirelim.</h2>
        <p>
          Eksik model, hatalı fiyat veya yeni özellik önerilerini doğrudan bize iletebilirsin.
          Kişisel bilgi toplamıyoruz; gönderimler yalnızca anonim oturum kimliğiyle ilişkilendirilir.
        </p>
      </div>

      <div className="feedback-layout">
        <div className="feedback-panel">
          <form className="feedback-card" onSubmit={submitFeedback}>
            <header>
              <span className="feedback-card-icon" aria-hidden="true">
                ✉
              </span>
              <div>
                <h3>Geri bildirim gönder</h3>
                <p>Eksik model, filtre önerisi, hata veya özellik isteği.</p>
              </div>
            </header>
            <label>
              <span>Tür</span>
              <select
                value={feedbackType}
                onChange={(event) => {
                  setFeedbackType(event.target.value);
                  setFeedbackState("idle");
                }}
              >
                {feedbackOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Mesaj</span>
              <textarea
                value={message}
                minLength={3}
                maxLength={4000}
                required
                onChange={(event) => {
                  setMessage(event.target.value);
                  setFeedbackState("idle");
                }}
                placeholder="Örn. Bu modelin fiyatı yanlış görünüyor veya şu filtreyi ekleyin."
              />
            </label>
            <button
              type="submit"
              className="feedback-submit"
              disabled={message.trim().length < 3 || feedbackState === "sending"}
            >
              {feedbackState === "sending" ? "Gönderiliyor…" : "Geri bildirimi gönder"}
            </button>
            {feedbackState === "success" && (
              <p className="form-success" role="status">
                Teşekkürler — geri bildirimin kaydedildi.
              </p>
            )}
            {feedbackState === "error" && (
              <p className="form-error" role="alert">
                Gönderilemedi; lütfen tekrar dene.
              </p>
            )}
          </form>

          <form className="feedback-card" onSubmit={submitDemand}>
            <header>
              <span className="feedback-card-icon demand" aria-hidden="true">
                ◈
              </span>
              <div>
                <h3>LLMaaS model talebi</h3>
                <p>Türkiye’de hangi modellerin servis olarak sunulmasını istersin?</p>
              </div>
            </header>
            <fieldset>
              <legend>Model seçimi (çoklu)</legend>
              <div className="demand-grid">
                {demandOptions.map((model) => (
                  <label className="demand-option" key={model}>
                    <input
                      type="checkbox"
                      checked={demand.includes(model)}
                      onChange={() => {
                        setDemand((current) =>
                          current.includes(model)
                            ? current.filter((item) => item !== model)
                            : [...current, model],
                        );
                        setDemandState("idle");
                      }}
                    />
                    <span>{model}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>Diğer</span>
              <input
                value={otherModel}
                maxLength={200}
                onChange={(event) => {
                  setOtherModel(event.target.value);
                  setDemandState("idle");
                }}
                placeholder="Listede olmayan bir model adı"
              />
            </label>
            <button
              type="submit"
              className="feedback-submit secondary"
              disabled={(!demand.length && !otherModel.trim()) || demandState === "sending"}
            >
              {demandState === "sending" ? "Kaydediliyor…" : "Talebi kaydet"}
            </button>
            {demandState === "success" && (
              <p className="form-success" role="status">
                Model talebin kaydedildi — teşekkürler.
              </p>
            )}
            {demandState === "error" && (
              <p className="form-error" role="alert">
                Talep kaydedilemedi; tekrar dene.
              </p>
            )}
          </form>
        </div>

        <aside className="feedback-aside">
          <article>
            <p className="kicker">GİZLİLİK</p>
            <h4>Minimum veri</h4>
            <p>
              E-posta veya hesap bilgisi istemiyoruz. Yalnızca anonim oturum kimliği ve gönderim
              içeriği saklanır.
            </p>
          </article>
          <article>
            <p className="kicker">LLMaaS</p>
            <h4>Talep verisi ayrı tutulur</h4>
            <p>
              Model talepleri genel geri bildirimden ayrı sayılır; hangi modellere en çok ilgi
              olduğunu ölçmek için kullanılır.
            </p>
          </article>
          <article>
            <p className="kicker">YANIT SÜRESİ</p>
            <h4>İnceleme süreci</h4>
            <p>
              Gönderimler önce <strong>new</strong> durumunda kaydedilir; ekip tarafından
              incelendikçe planlanır veya tamamlanır.
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}
