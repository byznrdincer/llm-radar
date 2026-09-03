"use client";

import { useEffect } from "react";
import { toPublicSourceUrl } from "../lib/publicSourceUrl";
import { useLanguage, type Language } from "../lib/i18n";

type DetailPricing = {
  input: string | null;
  output: string | null;
  cache_read: string | null;
  currency: string;
  observed_at: string;
  unit?: string;
};

type DetailSource = {
  name: string;
  url: string;
  reliability: string;
  source_class: string | null;
};

type DetailBenchmark = {
  benchmark: string;
  benchmark_slug: string;
  rank: number;
  score: number;
  published_at: string;
  source_url: string;
};

export type ModelDetailData = {
  id: string;
  slug: string;
  name: string;
  family?: string | null;
  version?: string | null;
  release_date?: string | null;
  parameter_count?: number | null;
  active_parameter_count?: number | null;
  status?: string | null;
  company: { slug: string; name: string };
  context_window: number | null;
  capabilities: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing: DetailPricing | null;
  profile?: {
    max_output_tokens?: number | null;
    modalities?: string[];
    capabilities?: string[];
    tool_calling: boolean | null;
    structured_output?: boolean | null;
    reasoning: boolean | null;
    streaming?: boolean | null;
    availability: string | null;
    openness?: string | null;
    license: string | null;
    commercial_use_status?: string | null;
    observed_at?: string | null;
  };
  description: string | null;
  tokenizer: string | null;
  created: number | null;
  sources: DetailSource[];
  price_history: DetailPricing[];
  benchmarks: DetailBenchmark[];
};

type Props = {
  loading: boolean;
  model: ModelDetailData | null;
  missing: string | null;
  isCompared: boolean;
  compareDisabled: boolean;
  onClose: () => void;
  onToggleCompare: () => void;
  onOpenCatalog: () => void;
};

const modalityLabels: Record<Language, Record<string, string>> = {
  tr: {
    text: "Metin",
    image: "Görsel",
    audio: "Ses",
    video: "Video",
    file: "Dosya",
  },
  en: {
    text: "Text",
    image: "Image",
    audio: "Audio",
    video: "Video",
    file: "File",
  },
};

const capabilityLabels: Record<Language, Record<string, string>> = {
  tr: {
    reasoning: "Akıl yürütme",
    coding: "Kodlama",
    vision: "Görsel analiz",
    multimodal: "Çok modlu",
    tool_calling: "Araç kullanımı",
    function_calling: "Fonksiyon çağırma",
    structured_output: "Yapılandırılmış çıktı",
    computer_use: "Bilgisayar kullanımı",
    agents: "Ajan görevleri",
    agent: "Ajan görevleri",
    agentic: "Ajan görevleri",
    long_context: "Uzun bağlam",
    web_search: "Web arama",
    prompt_caching: "Prompt önbelleği",
    streaming: "Akışlı yanıt",
  },
  en: {
    reasoning: "Reasoning",
    coding: "Coding",
    vision: "Vision analysis",
    multimodal: "Multimodal",
    tool_calling: "Tool use",
    function_calling: "Function calling",
    structured_output: "Structured output",
    computer_use: "Computer use",
    agents: "Agent tasks",
    agent: "Agent tasks",
    agentic: "Agent tasks",
    long_context: "Long context",
    web_search: "Web search",
    prompt_caching: "Prompt caching",
    streaming: "Streaming responses",
  },
};

const opennessLabels: Record<Language, Record<string, string>> = {
  tr: {
    open_source: "Open Source",
    open_weight: "Open Weight",
    proprietary: "Closed Source",
    unknown: "Açıklık bilinmiyor",
  },
  en: {
    open_source: "Open Source",
    open_weight: "Open Weight",
    proprietary: "Closed Source",
    unknown: "Openness unknown",
  },
};

const availabilityLabels: Record<Language, Record<string, string>> = {
  tr: {
    api: "API erişimi",
    hosted: "Barındırılan API",
    local: "Yerel kullanım",
    open_source: "Open Source",
    open_weight: "Open Weight",
    proprietary: "Closed Source",
    unknown: "Erişim bilinmiyor",
  },
  en: {
    api: "API access",
    hosted: "Hosted API",
    local: "Local use",
    open_source: "Open Source",
    open_weight: "Open Weight",
    proprietary: "Closed Source",
    unknown: "Access unknown",
  },
};

const reliabilityLabels: Record<Language, Record<string, string>> = {
  tr: {
    official_api: "Resmî API verisi",
    official_document: "Resmî dokümantasyon",
    independent_measurement: "Bağımsız ölçüm",
    academic: "Akademik kaynak",
    third_party: "Üçüncü taraf sağlayıcı verisi",
    community: "Topluluk verisi",
  },
  en: {
    official_api: "Official API data",
    official_document: "Official documentation",
    independent_measurement: "Independent measurement",
    academic: "Academic source",
    third_party: "Third-party provider data",
    community: "Community data",
  },
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function money(value: string | null | undefined, locale: string) {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString(locale, { maximumFractionDigits: 4 })}`;
}

function compactNumber(value: number | null | undefined, locale: string) {
  if (value == null) return "—";
  return Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function publicSourceUrl(source: DetailSource, modelSlug: string) {
  const sourceSlug = source.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const isOpenRouter = sourceSlug.includes("openrouter") || source.url?.includes("openrouter.ai/api/v1/models");
  if (isOpenRouter) return `https://openrouter.ai/${modelSlug}`;
  return toPublicSourceUrl(source.url, { sourceSlug, modelHint: modelSlug });
}

function isPublicHttpUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function deriveUseCases(model: ModelDetailData, capabilities: string[], modalities: string[], language: Language) {
  const benchmarkText = model.benchmarks.map(item => `${item.benchmark} ${item.benchmark_slug}`).join(" ").toLowerCase();
  const capabilitySet = new Set(capabilities.map(item => item.toLowerCase()));
  const items: Array<{ icon: string; title: string; description: string }> = [];

  if (capabilitySet.has("coding") || /code|swe-bench/.test(benchmarkText)) {
    items.push(
      language === "tr"
        ? { icon: "</>", title: "Kodlama", description: "Kod üretimi, inceleme ve yazılım görevleri" }
        : { icon: "</>", title: "Coding", description: "Code generation, review, and software tasks" },
    );
  }
  if (["agents", "agent", "agentic", "tool_calling", "function_calling"].some(item => capabilitySet.has(item)) || /agent|tau-bench/.test(benchmarkText)) {
    items.push(
      language === "tr"
        ? { icon: "↗", title: "Ajan görevleri", description: "Araç kullanan ve çok adımlı iş akışları" }
        : { icon: "↗", title: "Agent tasks", description: "Tool-using and multi-step workflows" },
    );
  }
  if (capabilitySet.has("reasoning") || model.profile?.reasoning === true) {
    items.push(
      language === "tr"
        ? { icon: "◇", title: "Akıl yürütme", description: "Karmaşık analiz ve problem çözme" }
        : { icon: "◇", title: "Reasoning", description: "Complex analysis and problem solving" },
    );
  }
  if (modalities.includes("image") || capabilitySet.has("vision")) {
    items.push(
      language === "tr"
        ? { icon: "◉", title: "Görsel analiz", description: "Metin ve görseli birlikte yorumlama" }
        : { icon: "◉", title: "Vision analysis", description: "Interpreting text and images together" },
    );
  }
  if ((model.context_window ?? 0) >= 131_072 || capabilitySet.has("long_context")) {
    items.push(
      language === "tr"
        ? { icon: "↔", title: "Uzun bağlam", description: "Büyük belge ve uzun konuşma işleme" }
        : { icon: "↔", title: "Long context", description: "Processing large documents and long conversations" },
    );
  }
  return items.slice(0, 3);
}

export default function ModelDetailDrawer({
  loading,
  model,
  missing,
  isCompared,
  compareDisabled,
  onClose,
  onToggleCompare,
  onOpenCatalog,
}: Props) {
  const { language, locale } = useLanguage();
  const open = loading || Boolean(model) || Boolean(missing);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const latestPrice = model?.price_history[0] ?? model?.pricing ?? null;
  const modalities = model
    ? unique([
        ...(model.profile?.modalities ?? []),
        ...(model.capabilities.input_modalities ?? []),
        ...(model.capabilities.output_modalities ?? []),
      ]).map(item => item.toLowerCase())
    : [];
  const capabilities = model
    ? unique([
        ...(model.profile?.capabilities ?? []),
        model.profile?.tool_calling ? "tool_calling" : null,
        model.profile?.structured_output ? "structured_output" : null,
        model.profile?.reasoning ? "reasoning" : null,
        model.profile?.streaming ? "streaming" : null,
      ]).filter(item => !modalities.includes(item.toLowerCase()))
    : [];
  const useCases = model ? deriveUseCases(model, capabilities, modalities, language) : [];
  const openness = model?.profile?.openness ?? null;
  const availability = model?.profile?.availability ?? null;
  const license = model?.profile?.license ?? null;
  const licenseBadge = license && !["unknown", "proprietary", "open", "not applicable"].includes(license.toLowerCase())
    ? license
    : null;
  const commercialBadge = model?.profile?.commercial_use_status === "allowed"
    ? (language === "tr" ? "Ticari kullanıma izinli" : "Commercial use allowed")
    : model?.profile?.commercial_use_status === "restricted"
      ? (language === "tr" ? "Ticari kullanım kısıtlı" : "Commercial use restricted")
      : null;
  const badges = model
    ? unique([
        openness ? opennessLabels[language][openness] ?? openness.replaceAll("_", " ") : null,
        availability && availability !== openness
          ? availabilityLabels[language][availability] ?? availability.replaceAll("_", " ")
          : null,
        licenseBadge,
        commercialBadge,
        model.version ? (language === "tr" ? `Sürüm ${model.version}` : `Version ${model.version}`) : null,
        /(^|[:\s-])batch([\s-]|$)/i.test(`${model.slug} ${model.name}`) ? (language === "tr" ? "Batch sürümü" : "Batch version") : null,
      ]).slice(0, 4)
    : [];
  const releaseDate = formatDate(model?.release_date, locale);
  const observedAt = formatDate(latestPrice?.observed_at ?? model?.profile?.observed_at, locale);

  return (
    <div
      className="modal-backdrop model-detail-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="model-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="model-detail-title">
        {loading ? (
          <div className="model-detail-state"><span className="model-detail-spinner" />{language === "tr" ? "Model ayrıntıları yükleniyor…" : "Loading model details…"}</div>
        ) : model ? (
          <>
            <header className="model-detail-header">
              <button type="button" className="model-detail-close" aria-label={language === "tr" ? "Model ayrıntılarını kapat" : "Close model details"} onClick={onClose}>×</button>
              <p className="model-detail-eyebrow">
                <span>{model.company.name}</span>
                {model.family && <><i>•</i><span>{model.family}</span></>}
              </p>
              <h2 id="model-detail-title">{model.name}</h2>
              <code>{model.slug}</code>
              {badges.length > 0 && <div className="model-detail-badges">{badges.map(badge => <span key={badge}>{badge}</span>)}</div>}
              <p className="model-detail-description">{model.description || (language === "tr" ? "Bu model için doğrulanmış açıklama henüz bulunmuyor." : "No verified description is available for this model yet.")}</p>
              {(releaseDate || model.parameter_count || model.active_parameter_count) && (
                <div className="model-detail-meta">
                  {releaseDate && <span><small>{language === "tr" ? "Yayın" : "Released"}</small>{releaseDate}</span>}
                  {model.parameter_count != null && <span><small>{language === "tr" ? "Parametre" : "Parameters"}</small>{compactNumber(model.parameter_count, locale)}</span>}
                  {model.active_parameter_count != null && <span><small>{language === "tr" ? "Aktif parametre" : "Active parameters"}</small>{compactNumber(model.active_parameter_count, locale)}</span>}
                </div>
              )}
            </header>

            <div className="model-detail-body">
              <section className="model-detail-stats" aria-label={language === "tr" ? "Temel model özellikleri" : "Key model specs"}>
                <article><span>{language === "tr" ? "Bağlam" : "Context"}</span><strong>{model.context_window?.toLocaleString(locale) ?? "—"}</strong><small>token</small></article>
                <article><span>{model.profile?.max_output_tokens ? (language === "tr" ? "Maks. çıktı" : "Max output") : (language === "tr" ? "Tokenlaştırıcı" : "Tokenizer")}</span><strong>{model.profile?.max_output_tokens?.toLocaleString(locale) ?? model.tokenizer ?? "—"}</strong><small>{model.profile?.max_output_tokens ? "token" : (language === "tr" ? "model bilgisi" : "model info")}</small></article>
                <article><span>{language === "tr" ? "Girdi fiyatı" : "Input price"}</span><strong>{money(latestPrice?.input, locale)}</strong><small>1M token</small></article>
                <article><span>{language === "tr" ? "Çıktı fiyatı" : "Output price"}</span><strong>{money(latestPrice?.output, locale)}</strong><small>1M token</small></article>
              </section>

              {useCases.length > 0 && (
                <section className="model-detail-section">
                  <div className="model-detail-section-title"><div><p>{language === "tr" ? "KULLANIM REHBERİ" : "USE CASE GUIDE"}</p><h3>{language === "tr" ? "Hangi işler için uygun?" : "What is it suited for?"}</h3></div><small>{language === "tr" ? "Yetenek ve benchmark sinyallerine göre" : "Based on capability and benchmark signals"}</small></div>
                  <div className="model-detail-fit-grid">
                    {useCases.map(item => <article key={item.title}><i>{item.icon}</i><strong>{item.title}</strong><p>{item.description}</p></article>)}
                  </div>
                </section>
              )}

              {(capabilities.length > 0 || modalities.length > 0) && (
                <section className="model-detail-section">
                  <div className="model-detail-section-title"><div><p>{language === "tr" ? "DOĞRULANMIŞ ÖZELLİKLER" : "VERIFIED FEATURES"}</p><h3>{language === "tr" ? "Yetenekler ve modaliteler" : "Capabilities and modalities"}</h3></div></div>
                  <div className="model-detail-capability-groups">
                    {modalities.length > 0 && <div><span>{language === "tr" ? "Girdi / çıktı" : "Input / output"}</span><div>{modalities.map(item => <b key={item}>{modalityLabels[language][item] ?? item}</b>)}</div></div>}
                    {capabilities.length > 0 && <div><span>{language === "tr" ? "Yetenekler" : "Capabilities"}</span><div>{capabilities.map(item => <b key={item}>{capabilityLabels[language][item] ?? item.replaceAll("_", " ")}</b>)}</div></div>}
                  </div>
                </section>
              )}

              <section className="model-detail-section">
                <div className="model-detail-section-title"><div><p>{language === "tr" ? "PERFORMANS" : "PERFORMANCE"}</p><h3>{language === "tr" ? "Benchmark karnesi" : "Benchmark scorecard"}</h3></div><small>{model.benchmarks.length ? (language === "tr" ? `${model.benchmarks.length} doğrulanmış sonuç` : `${model.benchmarks.length} verified result${model.benchmarks.length === 1 ? "" : "s"}`) : (language === "tr" ? "Sonuç yok" : "No results")}</small></div>
                {model.benchmarks.length ? (
                  <div className="model-detail-benchmarks">
                    {model.benchmarks.map(score => {
                      const content = <><span><strong>{score.benchmark}</strong><small>{formatDate(score.published_at, locale)}</small></span><span className="model-detail-benchmark-score"><small>{language === "tr" ? "Skor" : "Score"}</small><b>{score.score.toLocaleString(locale, { maximumFractionDigits: 1 })}</b></span><em>#{score.rank}</em></>;
                      return isPublicHttpUrl(score.source_url)
                        ? <a key={score.benchmark_slug} href={score.source_url} target="_blank" rel="noreferrer">{content}</a>
                        : <div key={score.benchmark_slug}>{content}</div>;
                    })}
                  </div>
                ) : <p className="model-detail-empty">{language === "tr" ? "Bu model adıyla eşleşen doğrulanmış benchmark sonucu henüz yok." : "No verified benchmark result matching this model's name yet."}</p>}
              </section>

              <section className="model-detail-section">
                <div className="model-detail-section-title"><div><p>{language === "tr" ? "KAYNAK VE GÜVEN" : "SOURCE AND TRUST"}</p><h3>{language === "tr" ? "Veri nereden geliyor?" : "Where does the data come from?"}</h3></div>{observedAt && <small>{language === "tr" ? "Son gözlem" : "Last observed"}: {observedAt}</small>}</div>
                <div className="model-detail-sources">
                  {(model.sources?.length ? model.sources : [{ name: "OpenRouter", url: `https://openrouter.ai/${model.slug}`, reliability: "third_party", source_class: "independent" }]).map((source, index) => {
                    const href = publicSourceUrl(source, model.slug);
                    const reliability = reliabilityLabels[language][source.reliability] ?? (language === "tr" ? "Kaynak bilgisi" : "Source info");
                    const sourceClass = source.source_class === "official" ? (language === "tr" ? "Resmî" : "Official") : source.source_class === "independent" ? (language === "tr" ? "Bağımsız" : "Independent") : null;
                    return <article key={`${source.name}-${index}`}><span className="model-detail-source-icon">✓</span><div><strong>{source.name.toLowerCase() === "openrouter" ? "OpenRouter" : source.name}</strong><p>{reliability}{sourceClass ? ` · ${sourceClass}` : ""}</p></div>{isPublicHttpUrl(href) ? <a href={href!} target="_blank" rel="noreferrer">{language === "tr" ? "Kaynağı aç ↗" : "Open source ↗"}</a> : <small>{language === "tr" ? "Bağlantı yok" : "No link"}</small>}</article>;
                  })}
                </div>
              </section>
            </div>

            <footer className="model-detail-actions">
              <button type="button" className={isCompared ? "is-selected" : ""} onClick={onToggleCompare} disabled={compareDisabled}>
                <span>{isCompared ? "✓" : "+"}</span>{isCompared ? (language === "tr" ? "Karşılaştırmadan çıkar" : "Remove from comparison") : (language === "tr" ? "Karşılaştırmaya ekle" : "Add to comparison")}
              </button>
              <button type="button" onClick={onOpenCatalog}>{language === "tr" ? "Katalogda aç" : "Open in catalog"} <span>→</span></button>
            </footer>
          </>
        ) : (
          <div className="model-detail-state model-detail-missing">
            <button type="button" className="model-detail-close" aria-label={language === "tr" ? "Model ayrıntılarını kapat" : "Close model details"} onClick={onClose}>×</button>
            <span>!</span><h2 id="model-detail-title">{language === "tr" ? "Model bulunamadı" : "Model not found"}</h2><p>{missing}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
