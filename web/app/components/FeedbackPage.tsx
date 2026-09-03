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
import { useLanguage, type Language } from "../lib/i18n";

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
  ["missing_model", "Eksik model", "Missing model"],
  ["data_error", "Hatalı model verisi", "Incorrect model data"],
  ["pricing_error", "Fiyat hatası", "Pricing error"],
  ["benchmark_error", "Benchmark hatası", "Benchmark error"],
  ["source_suggestion", "Yeni kaynak önerisi", "New source suggestion"],
  ["filter_suggestion", "Filtre önerisi", "Filter suggestion"],
  ["feature_request", "Özellik isteği", "Feature request"],
  ["ux_feedback", "UI / UX geri bildirimi", "UI / UX feedback"],
  ["bug_report", "Hata bildirimi", "Bug report"],
  ["general", "Genel yorum", "General comment"],
] as const;

const subjectOptions = [
  ["price", "Fiyat", "Price"],
  ["benchmark", "Benchmark", "Benchmark"],
  ["context", "Context", "Context"],
  ["license", "Lisans", "License"],
  ["capability", "Yetenek / capability", "Capability"],
  ["provider", "Provider", "Provider"],
  ["source", "Kaynak", "Source"],
  ["other", "Diğer", "Other"],
] as const;

const productAreas = [
  ["model_catalog", "Model kataloğu", "Model catalog"],
  ["compare", "Karşılaştır", "Compare"],
  ["benchmarks", "Benchmarklar", "Benchmarks"],
  ["popular", "Popüler modeller", "Popular models"],
  ["market", "Pazar grafikleri", "Market charts"],
  ["turkish_llm", "Türkiye LLM", "Turkey LLM"],
  ["developments", "Gelişmeler", "Developments"],
  ["research", "Araştırma", "Research"],
  ["technology_radar", "Teknoloji radarı", "Technology radar"],
  ["sources", "Kaynaklar", "Sources"],
  ["feedback", "Geri bildirim", "Feedback"],
  ["other", "Diğer", "Other"],
] as const;

const useCaseOptions = [
  ["chat", "Sohbet", "Chat"],
  ["rag", "RAG / Doküman", "RAG / Documents"],
  ["coding", "Kodlama", "Coding"],
  ["agent", "Agent / Tool calling", "Agent / Tool calling"],
  ["multimodal", "Multimodal", "Multimodal"],
  ["enterprise", "Kurumsal", "Enterprise"],
  ["other", "Diğer", "Other"],
] as const;

const criterionOptions = [
  ["performance", "Performans", "Performance"],
  ["price", "Fiyat", "Price"],
  ["speed", "Hız", "Speed"],
  ["turkish", "Türkçe kalitesi", "Turkish-language quality"],
  ["privacy", "Gizlilik", "Privacy"],
  ["open_weight", "Open-weight", "Open-weight"],
  ["data_residency", "Türkiye’de veri barındırma", "Data residency in Turkey"],
  ["openai_compatible", "OpenAI API uyumu", "OpenAI API compatibility"],
  ["fine_tuning", "Fine-tuning", "Fine-tuning"],
] as const;

const userTypeOptions = [
  ["developer", "Developer", "Developer"],
  ["startup", "Startup", "Startup"],
  ["enterprise", "Kurumsal şirket", "Enterprise company"],
  ["organization", "Organizasyon", "Organization"],
  ["individual", "Bireysel", "Individual"],
] as const;

const demandLevels = [
  ["interested", "İlgileniyorum", "Interested"],
  ["need", "İhtiyacım var", "I need this"],
  ["active_use", "Aktif kullanırım", "Actively using"],
] as const;

const usageVolumeOptions = [
  ["", "Belirtmek istemiyorum", "Prefer not to say"],
  ["pilot", "Pilot · 1M token altı", "Pilot · under 1M tokens"],
  ["under_10m", "1–10M token / ay", "1–10M tokens / month"],
  ["under_100m", "10–100M token / ay", "10–100M tokens / month"],
  ["over_100m", "100M+ token / ay", "100M+ tokens / month"],
] as const;

const budgetRangeOptions = [
  ["", "Belirtmek istemiyorum", "Prefer not to say"],
  ["unknown", "Henüz belli değil", "Not yet known"],
  ["under_100", "$100 altı / ay", "Under $100 / month"],
  ["100_500", "$100–500 / ay", "$100–500 / month"],
  ["500_2000", "$500–2.000 / ay", "$500–2,000 / month"],
  ["over_2000", "$2.000+ / ay", "$2,000+ / month"],
] as const;

const timelineOptions = [
  ["", "Belirtmek istemiyorum", "Prefer not to say"],
  ["exploring", "Şimdilik araştırıyorum", "Just exploring for now"],
  ["this_quarter", "Bu çeyrek içinde", "Within this quarter"],
  ["immediate", "Hemen kullanmak istiyorum", "Want to start immediately"],
] as const;

const feedbackPlaceholders: Record<Language, Record<string, string>> = {
  tr: {
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
  },
  en: {
    missing_model:
      "Tell us the model's name, its developer, and the official source if you know it.",
    data_error:
      "Describe which piece of information looks wrong or missing, and what the correct value should be.",
    pricing_error:
      "Tell us which price is wrong, and the correct price if you know it.",
    benchmark_error:
      "Tell us which benchmark result is off, and what the correct value should be.",
    source_suggestion:
      "Tell us which source or platform you'd like added to Radar, and why it would be useful.",
    filter_suggestion:
      "Tell us which filter you'd like added and what use case it would help with.",
    feature_request:
      "Briefly describe the feature you want and what it would make easier for you.",
    ux_feedback:
      "Tell us which screen or flow gave you trouble, and how it could be better.",
    bug_report:
      "Tell us what you did, what you expected to happen, and what actually happened.",
    general:
      "Share your thoughts, suggestions, or anything else about Radar.",
  },
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

function optionLabel(
  entry: readonly [string, string, string],
  language: Language,
) {
  return language === "tr" ? entry[1] : entry[2];
}

function ModelPicker({
  api,
  selected,
  onChange,
  multiple = true,
  placeholder,
  maxSelected = 20,
}: ModelPickerProps) {
  const { language } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId().replace(/:/g, "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModelOption[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const resolvedPlaceholder =
    placeholder ??
    (language === "tr"
      ? "Model veya geliştirici ara..."
      : "Search model or developer...");

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
              title={
                language === "tr"
                  ? `${model.name} seçimini kaldır`
                  : `Remove ${model.name}`
              }
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
            placeholder={resolvedPlaceholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${listId}-results`}
          />

          {searchState === "loading" && (
            <small>{language === "tr" ? "Aranıyor…" : "Searching…"}</small>
          )}
        </div>

        {open && (
          <div
            className="smart-model-menu"
            id={`${listId}-results`}
            role="listbox"
          >
            {searchState === "error" && (
              <p className="smart-model-message">
                {language === "tr"
                  ? "Modeller yüklenemedi. Tekrar deneyebilirsin."
                  : "Couldn't load models. Please try again."}
              </p>
            )}

            {searchState !== "loading" &&
              searchState !== "error" &&
              availableResults.length === 0 && (
                <p className="smart-model-message">
                  {language === "tr"
                    ? "Sonuç bulunamadı."
                    : "No results found."}
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
          {language === "tr"
            ? `${selected.length} model seçildi · En fazla ${maxSelected}`
            : `${selected.length} model${selected.length === 1 ? "" : "s"} selected · Max ${maxSelected}`}
        </p>
      )}
    </div>
  );
}

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

  const severityOptions = [
    ["low", "Küçük", "Minor"],
    ["medium", "Önemli", "Major"],
    ["high", "Yüksek", "High"],
    ["critical", "Kritik", "Critical"],
  ] as const;

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
