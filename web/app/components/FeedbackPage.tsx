"use client";

import {
  FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { getSessionId, trackEvent } from "../lib/analytics";

type FormState = "idle" | "sending" | "success" | "error";
type SearchState = "idle" | "loading" | "success" | "error";

type ModelOption = {
  id: string;
  name: string;
  slug: string;
  developer: {
    slug: string;
    name: string;
  };
};

type ModelPickerProps = {
  api: string;
  selected: ModelOption[];
  onChange: (models: ModelOption[]) => void;
  multiple?: boolean;
  placeholder?: string;
  maxSelected?: number;
};

const feedbackOptions = [
  ["missing_model", "Eksik model"],
  ["data_error", "Hatalı model verisi"],
  ["pricing_error", "Fiyat hatası"],
  ["benchmark_error", "Benchmark hatası"],
  ["source_suggestion", "Yeni kaynak önerisi"],
  ["filter_suggestion", "Filtre önerisi"],
  ["feature_request", "Özellik isteği"],
  ["ux_feedback", "UI / UX geri bildirimi"],
  ["bug_report", "Hata bildirimi"],
  ["general", "Genel yorum"],
] as const;

const subjectOptions = [
  ["price", "Fiyat"],
  ["benchmark", "Benchmark"],
  ["context", "Context"],
  ["license", "Lisans"],
  ["capability", "Yetenek / capability"],
  ["provider", "Provider"],
  ["source", "Kaynak"],
  ["other", "Diğer"],
] as const;

const productAreas = [
  ["model_catalog", "Model kataloğu"],
  ["compare", "Karşılaştır"],
  ["benchmarks", "Benchmarklar"],
  ["popular", "Popüler modeller"],
  ["market", "Pazar grafikleri"],
  ["turkish_llm", "Türkiye LLM"],
  ["developments", "Gelişmeler"],
  ["research", "Araştırma"],
  ["technology_radar", "Teknoloji radarı"],
  ["sources", "Kaynaklar"],
  ["feedback", "Geri bildirim"],
  ["other", "Diğer"],
] as const;

const useCaseOptions = [
  ["chat", "Sohbet"],
  ["rag", "RAG / Doküman"],
  ["coding", "Kodlama"],
  ["agent", "Agent / Tool calling"],
  ["multimodal", "Multimodal"],
  ["enterprise", "Kurumsal"],
  ["other", "Diğer"],
] as const;

const criterionOptions = [
  ["performance", "Performans"],
  ["price", "Fiyat"],
  ["speed", "Hız"],
  ["turkish", "Türkçe kalitesi"],
  ["privacy", "Gizlilik"],
  ["open_weight", "Open-weight"],
  ["data_residency", "Türkiye’de veri barındırma"],
  ["openai_compatible", "OpenAI API uyumu"],
  ["fine_tuning", "Fine-tuning"],
] as const;

const userTypeOptions = [
  ["developer", "Developer"],
  ["startup", "Startup"],
  ["enterprise", "Kurumsal şirket"],
  ["organization", "Organizasyon"],
  ["individual", "Bireysel"],
] as const;

const demandLevels = [
  ["interested", "İlgileniyorum"],
  ["need", "İhtiyacım var"],
  ["active_use", "Aktif kullanırım"],
] as const;

const usageVolumeOptions = [
  ["", "Belirtmek istemiyorum"],
  ["pilot", "Pilot · 1M token altı"],
  ["under_10m", "1–10M token / ay"],
  ["under_100m", "10–100M token / ay"],
  ["over_100m", "100M+ token / ay"],
] as const;

const budgetRangeOptions = [
  ["", "Belirtmek istemiyorum"],
  ["unknown", "Henüz belli değil"],
  ["under_100", "$100 altı / ay"],
  ["100_500", "$100–500 / ay"],
  ["500_2000", "$500–2.000 / ay"],
  ["over_2000", "$2.000+ / ay"],
] as const;

const timelineOptions = [
  ["", "Belirtmek istemiyorum"],
  ["exploring", "Şimdilik araştırıyorum"],
  ["this_quarter", "Bu çeyrek içinde"],
  ["immediate", "Hemen kullanmak istiyorum"],
] as const;

const feedbackPlaceholders: Record<string, string> = {
  missing_model:
    "Eklenmesini istediğin modelin adını, geliştiricisini ve biliyorsan resmî kaynağını yaz.",
  data_error:
    "Hangi bilginin yanlış veya eksik göründüğünü ve doğru olması gereken değeri anlat.",
  pricing_error:
    "Hangi fiyat bilgisinin yanlış olduğunu ve doğru fiyatı biliyorsan belirt.",
  benchmark_error:
    "Hangi benchmark sonucunda sorun olduğunu ve doğru olması gereken değeri belirt.",
  source_suggestion:
    "Radar'a eklenmesini istediğin kaynak veya platformu ve neden faydalı olduğunu anlat.",
  filter_suggestion:
    "Eklenmesini istediğin filtreyi ve hangi kullanım senaryosunda işe yarayacağını anlat.",
  feature_request:
    "İstediğin özelliği ve sana neyi kolaylaştıracağını kısaca anlat.",
  ux_feedback:
    "Hangi ekran veya akışta zorlandığını ve nasıl daha iyi olabileceğini anlat.",
  bug_report:
    "Ne yaptığını, ne olmasını beklediğini ve gerçekte ne olduğunu anlat.",
  general:
    "Görüşünü, önerini veya Radar hakkında paylaşmak istediğin şeyi yaz.",
};

const modelRelatedFeedback = new Set([
  "data_error",
  "pricing_error",
  "benchmark_error",
]);

const subjectFeedback = new Set([
  "data_error",
  "pricing_error",
  "benchmark_error",
]);

const severityFeedback = new Set([
  "data_error",
  "pricing_error",
  "benchmark_error",
  "bug_report",
]);

const sourceFeedback = new Set([
  "missing_model",
  "data_error",
  "pricing_error",
  "benchmark_error",
  "source_suggestion",
]);

const productAreaFeedback = new Set([
  "filter_suggestion",
  "feature_request",
  "ux_feedback",
  "bug_report",
]);

function toggleValue(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function submissionContext() {
  return {
    page: `${window.location.pathname}${window.location.hash}`,
    section: "feedback",
    locale: window.navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

function ModelPicker({
  api,
  selected,
  onChange,
  multiple = true,
  placeholder = "Model veya geliştirici ara...",
  maxSelected = 20,
}: ModelPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId().replace(/:/g, "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModelOption[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const q = query.trim();

    if (!q) {
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      setOpen(true);

      const params = new URLSearchParams({
        search: q,
        limit: "12",
        sort_by: "name",
        sort_order: "asc",
      });

      try {
        const response = await fetch(
          `${api}/api/v1/models/search?${params}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Model search failed");
        }

        const data = await response.json();

        const items = (data?.items ?? []) as {
          id: string;
          name: string;
          slug: string;
          developer: {
            slug: string;
            name: string;
          };
        }[];

        setResults(
          items.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            developer: item.developer,
          })),
        );

        setHighlight(0);
        setSearchState("success");
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearchState("error");
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, query]);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", close);

    return () => {
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const availableResults = results.filter(
    (model) => !selected.some((item) => item.id === model.id),
  );

  function choose(model: ModelOption) {
    if (multiple) {
      if (selected.length >= maxSelected) return;
      onChange([...selected, model]);
    } else {
      onChange([model]);
    }

    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function remove(modelId: string) {
    onChange(selected.filter((model) => model.id !== modelId));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!open || availableResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        Math.min(current + 1, availableResults.length - 1),
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    }

    if (event.key === "Enter") {
      const model = availableResults[highlight];

      if (model) {
        event.preventDefault();
        choose(model);
      }
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="smart-model-picker">
      {selected.length > 0 && (
        <div className="smart-model-selected">
          {selected.map((model) => (
            <button
              type="button"
              className="smart-model-chip"
              key={model.id}
              onClick={() => remove(model.id)}
              title={`${model.name} seçimini kaldır`}
            >
              <span>{model.name}</span>
              <b aria-hidden="true">×</b>
            </button>
          ))}
        </div>
      )}

      <div className="smart-model-search" ref={rootRef}>
        <div className="smart-model-input">
          <span aria-hidden="true">⌕</span>

          <input
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (!nextQuery.trim()) {
                setResults([]);
                setSearchState("idle");
                setOpen(false);
                return;
              }
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim()) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${listId}-results`}
          />

          {searchState === "loading" && <small>Aranıyor…</small>}
        </div>

        {open && (
          <div
            className="smart-model-menu"
            id={`${listId}-results`}
            role="listbox"
          >
            {searchState === "error" && (
              <p className="smart-model-message">
                Modeller yüklenemedi. Tekrar deneyebilirsin.
              </p>
            )}

            {searchState !== "loading" &&
              searchState !== "error" &&
              availableResults.length === 0 && (
                <p className="smart-model-message">
                  Sonuç bulunamadı.
                </p>
              )}

            {availableResults.map((model, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? "active" : ""}
                key={model.id}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(model)}
              >
                <span className="smart-model-mark" aria-hidden="true">
                  {model.name.slice(0, 2).toUpperCase()}
                </span>

                <span className="smart-model-copy">
                  <strong>{model.name}</strong>
                  <small>{model.developer.name}</small>
                </span>

                <b className="smart-model-add" aria-hidden="true">
                  +
                </b>
              </button>
            ))}
          </div>
        )}
      </div>

      {multiple && selected.length > 0 && (
        <p className="smart-model-note">
          {selected.length} model seçildi · En fazla {maxSelected}
        </p>
      )}
    </div>
  );
}

export default function FeedbackPage({ api }: { api: string }) {
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
        <p className="kicker">İLETİŞİM VE KATKI</p>
        <h2>Radar’ı birlikte geliştirelim.</h2>
        <p>
          Eksik model, hatalı veri veya yeni özellik önerilerini
          doğrudan bize iletebilirsin. Gönderimler anonim oturum
          kimliği ve yalnızca gerekli sayfa bağlamıyla ilişkilendirilir.
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
                <p>
                  Türü seç; ilgili model, veri alanı veya kaynak
                  bilgileri gerektiğinde otomatik olarak açılsın.
                </p>
              </div>
            </header>

            <label>
              <span>Tür</span>

              <select
                value={feedbackType}
                onChange={(event) =>
                  changeFeedbackType(event.target.value)
                }
              >
                {feedbackOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {modelRelatedFeedback.has(feedbackType) && (
              <div className="feedback-smart-field">
                <span className="feedback-smart-label">
                  İlgili model
                </span>

                <ModelPicker
                  api={api}
                  selected={feedbackModels}
                  onChange={(models) => {
                    setFeedbackModels(models);
                    setFeedbackState("idle");
                  }}
                  multiple={false}
                  placeholder="İlgili modeli ara..."
                />
              </div>
            )}

            {subjectFeedback.has(feedbackType) && (
              <label>
                <span>Hangi bilgi?</span>

                <select
                  value={subject}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    setFeedbackState("idle");
                  }}
                >
                  <option value="">Seç</option>

                  {subjectOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {productAreaFeedback.has(feedbackType) && (
              <label>
                <span>İlgili alan</span>

                <select
                  value={productArea}
                  onChange={(event) => {
                    setProductArea(event.target.value);
                    setFeedbackState("idle");
                  }}
                >
                  <option value="">Seç</option>

                  {productAreas.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {severityFeedback.has(feedbackType) && (
              <fieldset className="feedback-smart-group">
                <legend>Önem seviyesi</legend>

                <div className="feedback-choice-row">
                  {[
                    ["low", "Küçük"],
                    ["medium", "Önemli"],
                    ["high", "Yüksek"],
                    ["critical", "Kritik"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={
                        severity === value
                          ? "feedback-choice active"
                          : "feedback-choice"
                      }
                      onClick={() => {
                        setSeverity(
                          severity === value ? "" : value,
                        );
                        setFeedbackState("idle");
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {sourceFeedback.has(feedbackType) && (
              <label>
                <span>Kaynak URL · opsiyonel</span>

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
                placeholder={
                  feedbackPlaceholders[feedbackType] ??
                  feedbackPlaceholders.general
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
                ? "Gönderiliyor…"
                : feedbackState === "success"
                  ? "✓ Gönderildi"
                  : "Geri bildirimi gönder"}
            </button>

            {feedbackState === "error" && (
              <p className="form-error" role="alert">
                Gönderilemedi; lütfen tekrar dene.
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
                <h3>LLMaaS model talebi</h3>
                <p>
                  Türkiye’de hangi modellerin servis olarak
                  sunulmasını istersin?
                </p>
              </div>
            </header>

            <div className="feedback-smart-field">
              <span className="feedback-smart-label">
                Model seçimi
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
              <span>Listede olmayan model</span>

              <input
                value={otherModel}
                maxLength={200}
                onChange={(event) => {
                  setOtherModel(event.target.value);
                  setDemandState("idle");
                }}
                placeholder="Model adını yaz"
              />
            </label>

            {showDemandDetails && (
              <div className="feedback-progressive">
                <fieldset className="feedback-smart-group">
                  <legend>Sen kimsin? · opsiyonel</legend>

                  <div className="feedback-choice-row">
                    {userTypeOptions.map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={
                          userType.includes(value)
                            ? "feedback-choice active"
                            : "feedback-choice"
                        }
                        onClick={() => {
                          setUserType((current) =>
                            toggleValue(current, value),
                          );
                          setDemandState("idle");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="demand-grid">
                    <label>
                      <span>Ad soyad · opsiyonel</span>

                      <input
                        value={fullName}
                        maxLength={160}
                        onChange={(event) => {
                          setFullName(event.target.value);
                          setDemandState("idle");
                        }}
                        placeholder="Adın soyadın"
                      />
                    </label>

                    <label>
                      <span>Şirket / organizasyon · opsiyonel</span>

                      <input
                        value={organizationName}
                        maxLength={160}
                        onChange={(event) => {
                          setOrganizationName(event.target.value);
                          setDemandState("idle");
                        }}
                        placeholder="Şirket veya organizasyon adı"
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="feedback-smart-group">
                  <legend>Ne için kullanırsın?</legend>

                  <div className="feedback-choice-row">
                    {useCaseOptions.map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={
                          useCases.includes(value)
                            ? "feedback-choice active"
                            : "feedback-choice"
                        }
                        onClick={() => {
                          setUseCases((current) =>
                            toggleValue(current, value),
                          );
                          setDemandState("idle");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="feedback-smart-group">
                  <legend>Senin için en önemli kriterler?</legend>

                  <div className="feedback-choice-row">
                    {criterionOptions.map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={
                          criteria.includes(value)
                            ? "feedback-choice active"
                            : "feedback-choice"
                        }
                        onClick={() => {
                          setCriteria((current) =>
                            toggleValue(current, value),
                          );
                          setDemandState("idle");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="feedback-smart-group">
                  <legend>Talep seviyesi</legend>

                  <div className="feedback-demand-levels">
                    {demandLevels.map(([value, label]) => (
                      <label
                        className={
                          demandLevel === value
                            ? "feedback-demand-level active"
                            : "feedback-demand-level"
                        }
                        key={value}
                      >
                        <input
                          type="radio"
                          name="demand-level"
                          value={value}
                          checked={demandLevel === value}
                          onChange={() => {
                            setDemandLevel(value);
                            setDemandState("idle");
                          }}
                        />

                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="demand-grid">
                  <label>
                    <span>Aylık kullanım tahmini</span>

                    <select
                      value={usageVolume}
                      onChange={(event) => {
                        setUsageVolume(event.target.value);
                        setDemandState("idle");
                      }}
                    >
                      {usageVolumeOptions.map(([value, label]) => (
                        <option value={value} key={value || "empty"}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Aylık bütçe tahmini · USD</span>

                    <select
                      value={budgetRange}
                      onChange={(event) => {
                        setBudgetRange(event.target.value);
                        setDemandState("idle");
                      }}
                    >
                      {budgetRangeOptions.map(([value, label]) => (
                        <option value={value} key={value || "empty"}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Planlanan başlangıç</span>

                    <select
                      value={timeline}
                      onChange={(event) => {
                        setTimeline(event.target.value);
                        setDemandState("idle");
                      }}
                    >
                      {timelineOptions.map(([value, label]) => (
                        <option value={value} key={value || "empty"}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  <span>Eklemek istediğin bir not var mı? · opsiyonel</span>

                  <textarea
                    value={userNote}
                    maxLength={2000}
                    onChange={(event) => {
                      setUserNote(event.target.value);
                      setDemandState("idle");
                    }}
                    placeholder="Talebinle ilgili eklemek istediğin bağlam"
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
                ? "Kaydediliyor…"
                : demandState === "success"
                  ? "✓ Talep kaydedildi"
                  : "Talebi kaydet"}
            </button>

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
              E-posta veya hesap bilgisi istemiyoruz. Anonim oturum,
              gönderim içeriği ve bildirimin geldiği sayfa saklanır.
            </p>
          </article>

          <article>
            <p className="kicker">LLMaaS</p>
            <h4>Daha anlamlı talep sinyali</h4>
            <p>
              Kullanım amacı, hacim ve bütçe kapasite ve ürün
              planlamasında birlikte değerlendirilir.
            </p>
          </article>

          <article>
            <p className="kicker">GERİ BİLDİRİM</p>
            <h4>Bağlamla birlikte değerlendirilir</h4>
            <p>
              Model, veri alanı, kaynak ve önem seviyesi gibi bilgiler
              geri bildirimin daha hızlı incelenmesini sağlar.
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}
