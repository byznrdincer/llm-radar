"use client";

import { FormEvent, useState } from "react";

import { getSessionId, trackEvent } from "../lib/analytics";
import {
  budgetRangeOptions,
  criterionOptions,
  demandLevels,
  feedbackOptions,
  feedbackPlaceholders,
  modelRelatedFeedback,
  optionLabel,
  productAreaFeedback,
  productAreas,
  severityFeedback,
  severityOptions,
  sourceFeedback,
  subjectFeedback,
  subjectOptions,
  submissionContext,
  timelineOptions,
  toggleValue,
  usageVolumeOptions,
  useCaseOptions,
  userTypeOptions,
} from "../lib/feedbackContent";
import type { FormState, ModelOption } from "../lib/feedbackTypes";
import { useLanguage } from "../lib/i18n";
import ModelPicker from "./ModelPicker";

export default function FeedbackPage({ api }: { api: string }) {
  const { language } = useLanguage();
  const [feedbackType, setFeedbackType] = useState("general");
  const [message, setMessage] = useState("");
  const [feedbackState, setFeedbackState] =
    useState<FormState>("idle");

  const [feedbackModels, setFeedbackModels] =
    useState<ModelOption[]>([]);
  const [subject, setSubject] = useState("");
  const [severity, setSeverity] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [productArea, setProductArea] = useState("");

  const [demandModels, setDemandModels] =
    useState<ModelOption[]>([]);
  const [otherModel, setOtherModel] = useState("");
  const [useCases, setUseCases] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [demandLevel, setDemandLevel] = useState("");
  const [usageVolume, setUsageVolume] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [timeline, setTimeline] = useState("");
  const [userType, setUserType] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [userNote, setUserNote] = useState("");
  const [demandState, setDemandState] =
    useState<FormState>("idle");

  const showDemandDetails =
    demandModels.length > 0 || otherModel.trim().length > 0;

  function changeFeedbackType(value: string) {
    setFeedbackType(value);
    setFeedbackState("idle");

    if (!modelRelatedFeedback.has(value)) {
      setFeedbackModels([]);
    }

    if (!subjectFeedback.has(value)) {
      setSubject("");
    }

    if (!severityFeedback.has(value)) {
      setSeverity("");
    }

    if (!sourceFeedback.has(value)) {
      setSourceUrl("");
    }

    if (!productAreaFeedback.has(value)) {
      setProductArea("");
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (message.trim().length < 3 || feedbackState === "sending") {
      return;
    }

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
          related_model_id: feedbackModels[0]?.id ?? null,
          subject: subject || null,
          severity: severity || null,
          source_url: sourceUrl.trim() || null,
          product_area: productArea || null,
          context: submissionContext(),
        }),
      });

      if (!response.ok) {
        throw new Error("Feedback gönderilemedi");
      }

      trackEvent(api, "feedback_submitted", {
        metadata: {
          feedback_type: feedbackType,
          related_model_id: feedbackModels[0]?.id ?? null,
          subject: subject || null,
          severity: severity || null,
          product_area: productArea || null,
        },
      });

      setMessage("");
      setFeedbackModels([]);
      setSubject("");
      setSeverity("");
      setSourceUrl("");
      setProductArea("");
      setFeedbackState("success");
    } catch {
      setFeedbackState("error");
    }
  }

  async function submitDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      (!demandModels.length && !otherModel.trim()) ||
      demandState === "sending"
    ) {
      return;
    }

    setDemandState("sending");

    try {
      const response = await fetch(`${api}/api/v1/model-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: window.crypto.randomUUID(),
          session_id: getSessionId(),
          requested_models: demandModels.map((model) => model.name),
          requested_model_ids: demandModels.map((model) => model.id),
          other_model: otherModel.trim() || null,
          use_cases: useCases,
          criteria,
          demand_level: demandLevel || null,
          usage_volume: usageVolume || null,
          budget_range: budgetRange || null,
          timeline: timeline || null,
          user_type: userType,
          full_name: fullName.trim() || null,
          organization_name: organizationName.trim() || null,
          user_note: userNote.trim() || null,
          context: submissionContext(),
        }),
      });

      if (!response.ok) {
        throw new Error("Talep gönderilemedi");
      }

      trackEvent(api, "model_requested", {
        metadata: {
          requested_models: demandModels.map((model) => model.name),
          requested_model_ids: demandModels.map((model) => model.id),
          use_cases: useCases,
          criteria,
          demand_level: demandLevel || null,
          usage_volume: usageVolume || null,
          budget_range: budgetRange || null,
          timeline: timeline || null,
          user_type: userType,
        },
      });

      setDemandModels([]);
      setOtherModel("");
      setUseCases([]);
      setCriteria([]);
      setDemandLevel("");
      setUsageVolume("");
      setBudgetRange("");
      setTimeline("");
      setUserType([]);
      setFullName("");
      setOrganizationName("");
      setUserNote("");
      setDemandState("success");
    } catch {
      setDemandState("error");
    }
  }

  return (
    <section className="feedback-page" id="feedback">
      <div className="feedback-hero">
        <p className="kicker">
          {language === "tr" ? "İLETİŞİM VE KATKI" : "CONTACT & CONTRIBUTE"}
        </p>
        <h2>
          {language === "tr"
            ? "Radar’ı birlikte geliştirelim."
            : "Let's build Radar together."}
        </h2>
        <p>
          {language === "tr"
            ? "Eksik model, hatalı veri veya yeni özellik önerilerini doğrudan bize iletebilirsin. Gönderimler anonim oturum kimliği ve yalnızca gerekli sayfa bağlamıyla ilişkilendirilir."
            : "You can send us missing models, incorrect data, or new feature suggestions directly. Submissions are linked only to an anonymous session ID and the minimal page context needed."}
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
                <h3>
                  {language === "tr" ? "Geri bildirim gönder" : "Send feedback"}
                </h3>
                <p>
                  {language === "tr"
                    ? "Türü seç; ilgili model, veri alanı veya kaynak bilgileri gerektiğinde otomatik olarak açılsın."
                    : "Pick a type; the related model, data field, or source fields will appear automatically when needed."}
                </p>
              </div>
            </header>

            <label>
              <span>{language === "tr" ? "Tür" : "Type"}</span>

              <select
                value={feedbackType}
                onChange={(event) =>
                  changeFeedbackType(event.target.value)
                }
              >
                {feedbackOptions.map((entry) => (
                  <option value={entry[0]} key={entry[0]}>
                    {optionLabel(entry, language)}
                  </option>
                ))}
              </select>
            </label>

            {modelRelatedFeedback.has(feedbackType) && (
              <div className="feedback-smart-field">
                <span className="feedback-smart-label">
                  {language === "tr" ? "İlgili model" : "Related model"}
                </span>

                <ModelPicker
                  api={api}
                  selected={feedbackModels}
                  onChange={(models) => {
                    setFeedbackModels(models);
                    setFeedbackState("idle");
                  }}
                  multiple={false}
                  placeholder={
                    language === "tr"
                      ? "İlgili modeli ara..."
                      : "Search related model..."
                  }
                />
              </div>
            )}

            {subjectFeedback.has(feedbackType) && (
              <label>
                <span>
                  {language === "tr" ? "Hangi bilgi?" : "Which info?"}
                </span>

                <select
                  value={subject}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    setFeedbackState("idle");
                  }}
                >
                  <option value="">
                    {language === "tr" ? "Seç" : "Select"}
                  </option>

                  {subjectOptions.map((entry) => (
                    <option value={entry[0]} key={entry[0]}>
                      {optionLabel(entry, language)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {productAreaFeedback.has(feedbackType) && (
              <label>
                <span>
                  {language === "tr" ? "İlgili alan" : "Related area"}
                </span>

                <select
                  value={productArea}
                  onChange={(event) => {
                    setProductArea(event.target.value);
                    setFeedbackState("idle");
                  }}
                >
                  <option value="">
                    {language === "tr" ? "Seç" : "Select"}
                  </option>

                  {productAreas.map((entry) => (
                    <option value={entry[0]} key={entry[0]}>
                      {optionLabel(entry, language)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {severityFeedback.has(feedbackType) && (
              <fieldset className="feedback-smart-group">
                <legend>
                  {language === "tr" ? "Önem seviyesi" : "Severity"}
                </legend>

                <div className="feedback-choice-row">
                  {severityOptions.map((entry) => (
                    <button
                      type="button"
                      key={entry[0]}
                      className={
                        severity === entry[0]
                          ? "feedback-choice active"
                          : "feedback-choice"
                      }
                      onClick={() => {
                        setSeverity(
                          severity === entry[0] ? "" : entry[0],
                        );
                        setFeedbackState("idle");
                      }}
                    >
                      {optionLabel(entry, language)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {sourceFeedback.has(feedbackType) && (
              <label>
                <span>
                  {language === "tr"
                    ? "Kaynak URL · opsiyonel"
                    : "Source URL · optional"}
                </span>

                <input
                  type="url"
                  value={sourceUrl}
                  maxLength={500}
                  onChange={(event) => {
                    setSourceUrl(event.target.value);
                    setFeedbackState("idle");
                  }}
                  placeholder="https://..."
                />
              </label>
            )}

            <label>
              <span>{language === "tr" ? "Mesaj" : "Message"}</span>

              <textarea
                value={message}
                minLength={3}
                maxLength={4000}
                required
                onChange={(event) => {
                  setMessage(event.target.value);
                  setFeedbackState("idle");
                }}
                placeholder={
                  feedbackPlaceholders[language][feedbackType] ??
                  feedbackPlaceholders[language].general
                }
              />
            </label>

            <button
              type="submit"
              className="feedback-submit"
              disabled={
                message.trim().length < 3 ||
                feedbackState === "sending"
              }
            >
              {feedbackState === "sending"
                ? language === "tr"
                  ? "Gönderiliyor…"
                  : "Sending…"
                : feedbackState === "success"
                  ? language === "tr"
                    ? "✓ Gönderildi"
                    : "✓ Sent"
                  : language === "tr"
                    ? "Geri bildirimi gönder"
                    : "Send feedback"}
            </button>

            {feedbackState === "error" && (
              <p className="form-error" role="alert">
                {language === "tr"
                  ? "Gönderilemedi; lütfen tekrar dene."
                  : "Couldn't send; please try again."}
              </p>
            )}

          </form>

          <form className="feedback-card" onSubmit={submitDemand}>
            <header>
              <span
                className="feedback-card-icon demand"
                aria-hidden="true"
              >
                ◈
              </span>

              <div>
                <h3>
                  {language === "tr"
                    ? "LLMaaS model talebi"
                    : "LLMaaS model request"}
                </h3>
                <p>
                  {language === "tr"
                    ? "Türkiye’de hangi modellerin servis olarak sunulmasını istersin?"
                    : "Which models would you like offered as a service in Turkey?"}
                </p>
              </div>
            </header>

            <div className="feedback-smart-field">
              <span className="feedback-smart-label">
                {language === "tr" ? "Model seçimi" : "Model selection"}
              </span>

              <ModelPicker
                api={api}
                selected={demandModels}
                onChange={(models) => {
                  setDemandModels(models);
                  setDemandState("idle");
                }}
                multiple
                maxSelected={20}
              />
            </div>

            <label>
              <span>
                {language === "tr"
                  ? "Listede olmayan model"
                  : "Model not in the list"}
              </span>

              <input
                value={otherModel}
                maxLength={200}
                onChange={(event) => {
                  setOtherModel(event.target.value);
                  setDemandState("idle");
                }}
                placeholder={
                  language === "tr"
                    ? "Model adını yaz"
                    : "Type the model name"
                }
              />
            </label>

            {showDemandDetails && (
              <div className="feedback-progressive">
                <fieldset className="feedback-smart-group">
                  <legend>
                    {language === "tr"
                      ? "Sen kimsin? · opsiyonel"
                      : "Who are you? · optional"}
                  </legend>

                  <div className="feedback-choice-row">
                    {userTypeOptions.map((entry) => (
                      <button
                        type="button"
                        key={entry[0]}
                        className={
                          userType.includes(entry[0])
                            ? "feedback-choice active"
                            : "feedback-choice"
                        }
                        onClick={() => {
                          setUserType((current) =>
                            toggleValue(current, entry[0]),
                          );
                          setDemandState("idle");
                        }}
                      >
                        {optionLabel(entry, language)}
                      </button>
                    ))}
                  </div>

                  <div className="demand-grid">
                    <label>
                      <span>
                        {language === "tr"
                          ? "Ad soyad · opsiyonel"
                          : "Full name · optional"}
                      </span>

                      <input
                        value={fullName}
                        maxLength={160}
                        onChange={(event) => {
                          setFullName(event.target.value);
                          setDemandState("idle");
                        }}
                        placeholder={
                          language === "tr"
                            ? "Adın soyadın"
                            : "Your full name"
                        }
                      />
                    </label>

                    <label>
                      <span>
                        {language === "tr"
                          ? "Şirket / organizasyon · opsiyonel"
                          : "Company / organization · optional"}
                      </span>

                      <input
                        value={organizationName}
                        maxLength={160}
                        onChange={(event) => {
                          setOrganizationName(event.target.value);
                          setDemandState("idle");
                        }}
                        placeholder={
                          language === "tr"
                            ? "Şirket veya organizasyon adı"
                            : "Company or organization name"
                        }
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="feedback-smart-group">
                  <legend>
                    {language === "tr"
                      ? "Ne için kullanırsın?"
                      : "What will you use it for?"}
                  </legend>

                  <div className="feedback-choice-row">
                    {useCaseOptions.map((entry) => (
                      <button
                        type="button"
                        key={entry[0]}
                        className={
                          useCases.includes(entry[0])
                            ? "feedback-choice active"
                            : "feedback-choice"
                        }
                        onClick={() => {
                          setUseCases((current) =>
                            toggleValue(current, entry[0]),
                          );
                          setDemandState("idle");
                        }}
                      >
                        {optionLabel(entry, language)}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="feedback-smart-group">
                  <legend>
                    {language === "tr"
                      ? "Senin için en önemli kriterler?"
                      : "What matters most to you?"}
                  </legend>

                  <div className="feedback-choice-row">
                    {criterionOptions.map((entry) => (
                      <button
                        type="button"
                        key={entry[0]}
                        className={
                          criteria.includes(entry[0])
                            ? "feedback-choice active"
                            : "feedback-choice"
                        }
                        onClick={() => {
                          setCriteria((current) =>
                            toggleValue(current, entry[0]),
                          );
                          setDemandState("idle");
                        }}
                      >
                        {optionLabel(entry, language)}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="feedback-smart-group">
                  <legend>
                    {language === "tr" ? "Talep seviyesi" : "Demand level"}
                  </legend>

                  <div className="feedback-demand-levels">
                    {demandLevels.map((entry) => (
                      <label
                        className={
                          demandLevel === entry[0]
                            ? "feedback-demand-level active"
                            : "feedback-demand-level"
                        }
                        key={entry[0]}
                      >
                        <input
                          type="radio"
                          name="demand-level"
                          value={entry[0]}
                          checked={demandLevel === entry[0]}
                          onChange={() => {
                            setDemandLevel(entry[0]);
                            setDemandState("idle");
                          }}
                        />

                        <span>{optionLabel(entry, language)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="demand-grid">
                  <label>
                    <span>
                      {language === "tr"
                        ? "Aylık kullanım tahmini"
                        : "Estimated monthly usage"}
                    </span>

                    <select
                      value={usageVolume}
                      onChange={(event) => {
                        setUsageVolume(event.target.value);
                        setDemandState("idle");
                      }}
                    >
                      {usageVolumeOptions.map((entry) => (
                        <option value={entry[0]} key={entry[0] || "empty"}>
                          {optionLabel(entry, language)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>
                      {language === "tr"
                        ? "Aylık bütçe tahmini · USD"
                        : "Estimated monthly budget · USD"}
                    </span>

                    <select
                      value={budgetRange}
                      onChange={(event) => {
                        setBudgetRange(event.target.value);
                        setDemandState("idle");
                      }}
                    >
                      {budgetRangeOptions.map((entry) => (
                        <option value={entry[0]} key={entry[0] || "empty"}>
                          {optionLabel(entry, language)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>
                      {language === "tr"
                        ? "Planlanan başlangıç"
                        : "Planned start"}
                    </span>

                    <select
                      value={timeline}
                      onChange={(event) => {
                        setTimeline(event.target.value);
                        setDemandState("idle");
                      }}
                    >
                      {timelineOptions.map((entry) => (
                        <option value={entry[0]} key={entry[0] || "empty"}>
                          {optionLabel(entry, language)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  <span>
                    {language === "tr"
                      ? "Eklemek istediğin bir not var mı? · opsiyonel"
                      : "Anything else you'd like to add? · optional"}
                  </span>

                  <textarea
                    value={userNote}
                    maxLength={2000}
                    onChange={(event) => {
                      setUserNote(event.target.value);
                      setDemandState("idle");
                    }}
                    placeholder={
                      language === "tr"
                        ? "Talebinle ilgili eklemek istediğin bağlam"
                        : "Any context you'd like to add about your request"
                    }
                  />
                </label>
              </div>
            )}

            <button
              type="submit"
              className="feedback-submit secondary"
              disabled={
                (!demandModels.length && !otherModel.trim()) ||
                demandState === "sending"
              }
            >
              {demandState === "sending"
                ? language === "tr"
                  ? "Kaydediliyor…"
                  : "Saving…"
                : demandState === "success"
                  ? language === "tr"
                    ? "✓ Talep kaydedildi"
                    : "✓ Request saved"
                  : language === "tr"
                    ? "Talebi kaydet"
                    : "Save request"}
            </button>

            {demandState === "error" && (
              <p className="form-error" role="alert">
                {language === "tr"
                  ? "Talep kaydedilemedi; tekrar dene."
                  : "Couldn't save the request; please try again."}
              </p>
            )}

          </form>
        </div>

        <aside className="feedback-aside">
          <article>
            <p className="kicker">
              {language === "tr" ? "GİZLİLİK" : "PRIVACY"}
            </p>
            <h4>{language === "tr" ? "Minimum veri" : "Minimal data"}</h4>
            <p>
              {language === "tr"
                ? "E-posta veya hesap bilgisi istemiyoruz. Anonim oturum, gönderim içeriği ve bildirimin geldiği sayfa saklanır."
                : "We don't ask for an email or account. We store an anonymous session, the submission content, and the page it came from."}
            </p>
          </article>

          <article>
            <p className="kicker">LLMaaS</p>
            <h4>
              {language === "tr"
                ? "Daha anlamlı talep sinyali"
                : "A more meaningful demand signal"}
            </h4>
            <p>
              {language === "tr"
                ? "Kullanım amacı, hacim ve bütçe kapasite ve ürün planlamasında birlikte değerlendirilir."
                : "Use case, volume, and budget are considered together for capacity and product planning."}
            </p>
          </article>

          <article>
            <p className="kicker">
              {language === "tr" ? "GERİ BİLDİRİM" : "FEEDBACK"}
            </p>
            <h4>
              {language === "tr"
                ? "Bağlamla birlikte değerlendirilir"
                : "Reviewed together with context"}
            </h4>
            <p>
              {language === "tr"
                ? "Model, veri alanı, kaynak ve önem seviyesi gibi bilgiler geri bildirimin daha hızlı incelenmesini sağlar."
                : "Details like model, data field, source, and severity help your feedback get reviewed faster."}
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}
