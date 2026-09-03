"use client";

import { useEffect } from "react";
import { toPublicSourceUrl } from "../lib/publicSourceUrl";

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

const modalityLabels: Record<string, string> = {
  text: "Metin",
  image: "Görsel",
  audio: "Ses",
  video: "Video",
  file: "Dosya",
};

const capabilityLabels: Record<string, string> = {
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
};

const opennessLabels: Record<string, string> = {
  open_source: "Open Source",
  open_weight: "Open Weight",
  proprietary: "Closed Source",
  unknown: "Açıklık bilinmiyor",
};

const availabilityLabels: Record<string, string> = {
  api: "API erişimi",
  hosted: "Barındırılan API",
  local: "Yerel kullanım",
  open_source: "Open Source",
  open_weight: "Open Weight",
  proprietary: "Closed Source",
  unknown: "Erişim bilinmiyor",
};

const reliabilityLabels: Record<string, string> = {
  official_api: "Resmî API verisi",
  official_document: "Resmî dokümantasyon",
  independent_measurement: "Bağımsız ölçüm",
  academic: "Akademik kaynak",
  third_party: "Üçüncü taraf sağlayıcı verisi",
  community: "Topluluk verisi",
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function money(value: string | null | undefined) {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`;
}

function compactNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
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

function deriveUseCases(model: ModelDetailData, capabilities: string[], modalities: string[]) {
  const benchmarkText = model.benchmarks.map(item => `${item.benchmark} ${item.benchmark_slug}`).join(" ").toLowerCase();
  const capabilitySet = new Set(capabilities.map(item => item.toLowerCase()));
  const items: Array<{ icon: string; title: string; description: string }> = [];

  if (capabilitySet.has("coding") || /code|swe-bench/.test(benchmarkText)) {
    items.push({ icon: "</>", title: "Kodlama", description: "Kod üretimi, inceleme ve yazılım görevleri" });
  }
  if (["agents", "agent", "agentic", "tool_calling", "function_calling"].some(item => capabilitySet.has(item)) || /agent|tau-bench/.test(benchmarkText)) {
    items.push({ icon: "↗", title: "Ajan görevleri", description: "Araç kullanan ve çok adımlı iş akışları" });
  }
  if (capabilitySet.has("reasoning") || model.profile?.reasoning === true) {
    items.push({ icon: "◇", title: "Akıl yürütme", description: "Karmaşık analiz ve problem çözme" });
  }
  if (modalities.includes("image") || capabilitySet.has("vision")) {
    items.push({ icon: "◉", title: "Görsel analiz", description: "Metin ve görseli birlikte yorumlama" });
  }
  if ((model.context_window ?? 0) >= 131_072 || capabilitySet.has("long_context")) {
    items.push({ icon: "↔", title: "Uzun bağlam", description: "Büyük belge ve uzun konuşma işleme" });
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
  const useCases = model ? deriveUseCases(model, capabilities, modalities) : [];
  const openness = model?.profile?.openness ?? null;
  const availability = model?.profile?.availability ?? null;
  const license = model?.profile?.license ?? null;
  const licenseBadge = license && !["unknown", "proprietary", "open", "not applicable"].includes(license.toLowerCase())
    ? license
    : null;
  const commercialBadge = model?.profile?.commercial_use_status === "allowed"
    ? "Ticari kullanıma izinli"
    : model?.profile?.commercial_use_status === "restricted"
      ? "Ticari kullanım kısıtlı"
      : null;
  const badges = model
    ? unique([
        openness ? opennessLabels[openness] ?? openness.replaceAll("_", " ") : null,
        availability && availability !== openness
          ? availabilityLabels[availability] ?? availability.replaceAll("_", " ")
          : null,
        licenseBadge,
        commercialBadge,
        model.version ? `Sürüm ${model.version}` : null,
        /(^|[:\s-])batch([\s-]|$)/i.test(`${model.slug} ${model.name}`) ? "Batch sürümü" : null,
      ]).slice(0, 4)
    : [];
  const releaseDate = formatDate(model?.release_date);
  const observedAt = formatDate(latestPrice?.observed_at ?? model?.profile?.observed_at);

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
          <div className="model-detail-state"><span className="model-detail-spinner" />Model ayrıntıları yükleniyor…</div>
        ) : model ? (
          <>
            <header className="model-detail-header">
              <button type="button" className="model-detail-close" aria-label="Model ayrıntılarını kapat" onClick={onClose}>×</button>
              <p className="model-detail-eyebrow">
                <span>{model.company.name}</span>
                {model.family && <><i>•</i><span>{model.family}</span></>}
              </p>
              <h2 id="model-detail-title">{model.name}</h2>
              <code>{model.slug}</code>
              {badges.length > 0 && <div className="model-detail-badges">{badges.map(badge => <span key={badge}>{badge}</span>)}</div>}
              <p className="model-detail-description">{model.description || "Bu model için doğrulanmış açıklama henüz bulunmuyor."}</p>
              {(releaseDate || model.parameter_count || model.active_parameter_count) && (
                <div className="model-detail-meta">
                  {releaseDate && <span><small>Yayın</small>{releaseDate}</span>}
                  {model.parameter_count != null && <span><small>Parametre</small>{compactNumber(model.parameter_count)}</span>}
                  {model.active_parameter_count != null && <span><small>Aktif parametre</small>{compactNumber(model.active_parameter_count)}</span>}
                </div>
              )}
            </header>

            <div className="model-detail-body">
              <section className="model-detail-stats" aria-label="Temel model özellikleri">
                <article><span>Bağlam</span><strong>{model.context_window?.toLocaleString("tr-TR") ?? "—"}</strong><small>token</small></article>
                <article><span>{model.profile?.max_output_tokens ? "Maks. çıktı" : "Tokenlaştırıcı"}</span><strong>{model.profile?.max_output_tokens?.toLocaleString("tr-TR") ?? model.tokenizer ?? "—"}</strong><small>{model.profile?.max_output_tokens ? "token" : "model bilgisi"}</small></article>
                <article><span>Girdi fiyatı</span><strong>{money(latestPrice?.input)}</strong><small>1M token</small></article>
                <article><span>Çıktı fiyatı</span><strong>{money(latestPrice?.output)}</strong><small>1M token</small></article>
              </section>

              {useCases.length > 0 && (
                <section className="model-detail-section">
                  <div className="model-detail-section-title"><div><p>KULLANIM REHBERİ</p><h3>Hangi işler için uygun?</h3></div><small>Yetenek ve benchmark sinyallerine göre</small></div>
                  <div className="model-detail-fit-grid">
                    {useCases.map(item => <article key={item.title}><i>{item.icon}</i><strong>{item.title}</strong><p>{item.description}</p></article>)}
                  </div>
                </section>
              )}

              {(capabilities.length > 0 || modalities.length > 0) && (
                <section className="model-detail-section">
                  <div className="model-detail-section-title"><div><p>DOĞRULANMIŞ ÖZELLİKLER</p><h3>Yetenekler ve modaliteler</h3></div></div>
                  <div className="model-detail-capability-groups">
                    {modalities.length > 0 && <div><span>Girdi / çıktı</span><div>{modalities.map(item => <b key={item}>{modalityLabels[item] ?? item}</b>)}</div></div>}
                    {capabilities.length > 0 && <div><span>Yetenekler</span><div>{capabilities.map(item => <b key={item}>{capabilityLabels[item] ?? item.replaceAll("_", " ")}</b>)}</div></div>}
                  </div>
                </section>
              )}

              <section className="model-detail-section">
                <div className="model-detail-section-title"><div><p>PERFORMANS</p><h3>Benchmark karnesi</h3></div><small>{model.benchmarks.length ? `${model.benchmarks.length} doğrulanmış sonuç` : "Sonuç yok"}</small></div>
                {model.benchmarks.length ? (
                  <div className="model-detail-benchmarks">
                    {model.benchmarks.map(score => {
                      const content = <><span><strong>{score.benchmark}</strong><small>{formatDate(score.published_at)}</small></span><span className="model-detail-benchmark-score"><small>Skor</small><b>{score.score.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</b></span><em>#{score.rank}</em></>;
                      return isPublicHttpUrl(score.source_url)
                        ? <a key={score.benchmark_slug} href={score.source_url} target="_blank" rel="noreferrer">{content}</a>
                        : <div key={score.benchmark_slug}>{content}</div>;
                    })}
                  </div>
                ) : <p className="model-detail-empty">Bu model adıyla eşleşen doğrulanmış benchmark sonucu henüz yok.</p>}
              </section>

              <section className="model-detail-section">
                <div className="model-detail-section-title"><div><p>KAYNAK VE GÜVEN</p><h3>Veri nereden geliyor?</h3></div>{observedAt && <small>Son gözlem: {observedAt}</small>}</div>
                <div className="model-detail-sources">
                  {(model.sources?.length ? model.sources : [{ name: "OpenRouter", url: `https://openrouter.ai/${model.slug}`, reliability: "third_party", source_class: "independent" }]).map((source, index) => {
                    const href = publicSourceUrl(source, model.slug);
                    const reliability = reliabilityLabels[source.reliability] ?? "Kaynak bilgisi";
                    const sourceClass = source.source_class === "official" ? "Resmî" : source.source_class === "independent" ? "Bağımsız" : null;
                    return <article key={`${source.name}-${index}`}><span className="model-detail-source-icon">✓</span><div><strong>{source.name.toLowerCase() === "openrouter" ? "OpenRouter" : source.name}</strong><p>{reliability}{sourceClass ? ` · ${sourceClass}` : ""}</p></div>{isPublicHttpUrl(href) ? <a href={href!} target="_blank" rel="noreferrer">Kaynağı aç ↗</a> : <small>Bağlantı yok</small>}</article>;
                  })}
                </div>
              </section>
            </div>

            <footer className="model-detail-actions">
              <button type="button" className={isCompared ? "is-selected" : ""} onClick={onToggleCompare} disabled={compareDisabled}>
                <span>{isCompared ? "✓" : "+"}</span>{isCompared ? "Karşılaştırmadan çıkar" : "Karşılaştırmaya ekle"}
              </button>
              <button type="button" onClick={onOpenCatalog}>Katalogda aç <span>→</span></button>
            </footer>
          </>
        ) : (
          <div className="model-detail-state model-detail-missing">
            <button type="button" className="model-detail-close" aria-label="Model ayrıntılarını kapat" onClick={onClose}>×</button>
            <span>!</span><h2 id="model-detail-title">Model bulunamadı</h2><p>{missing}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
