"use client";

import { useEffect, useMemo, useState } from "react";
import ModelAvatar from "./ModelAvatar";
import { useLanguage, type Language } from "../lib/i18n";

type SourceCatalogItem = {
  slug: string;
  name: string;
  url: string;
  public_url: string | null;
  category: string;
  source_class: string;
  collection_method: string;
  reliability: string;
  is_active: boolean;
  configured: boolean;
  status: string | null;
  last_success_at: string | null;
};

type Props = {
  api: string;
};

const METHOD_DESCRIPTIONS: Record<Language, Record<string, string>> = {
  tr: {
    openai: "Model duyuruları, API değişiklikleri, fiyatlar ve dokümantasyon.",
    anthropic: "Model duyuruları, API ve güvenlik dokümantasyonu.",
    google: "Gemini modelleri, araştırmalar ve resmî duyurular.",
    deepseek: "Model duyuruları ve teknik dokümanlar.",
    artificial_analysis: "Benchmark skorları, gecikme, throughput ve fiyat verileri.",
    artificial_analysis_benchmarks: "Benchmark skorları, gecikme, throughput ve fiyat verileri.",
    lmarena: "Kullanıcı tercihleri ve model karşılaştırmaları.",
    huggingface: "Açık ağırlıklı modeller, model kartları ve lisans bilgileri.",
    openrouter: "Modeller, provider'lar, context, fiyat ve yetenekler.",
    together: "Açık model kataloğu, context, lisans ve Together API fiyatları.",
    deepinfra: "Sunulan dil modelleri, context, fiyat ve modalite bilgileri.",
    fireworks: "Serverless dil modelleri, context, araç kullanımı ve model bağlantıları.",
    "cloudflare-workers-ai": "Workers AI model erişimi, context, fiyat ve yetenek bilgileri.",
    bifrost: "Topluluk model kataloğu, sağlayıcı uyumluluğu ve fiyat verileri.",
  },
  en: {
    openai: "Model announcements, API changes, pricing, and documentation.",
    anthropic: "Model announcements, API and safety documentation.",
    google: "Gemini models, research, and official announcements.",
    deepseek: "Model announcements and technical documentation.",
    artificial_analysis: "Benchmark scores, latency, throughput, and pricing data.",
    artificial_analysis_benchmarks: "Benchmark scores, latency, throughput, and pricing data.",
    lmarena: "User preferences and model comparisons.",
    huggingface: "Open-weight models, model cards, and license information.",
    openrouter: "Models, providers, context, pricing, and capabilities.",
    together: "Open model catalog, context, license, and Together API pricing.",
    deepinfra: "Hosted language models, context, pricing, and modality information.",
    fireworks: "Serverless language models, context, tool use, and model links.",
    "cloudflare-workers-ai": "Workers AI model access, context, pricing, and capability information.",
    bifrost: "Community model catalog, provider compatibility, and pricing data.",
  },
};

function sourceDescription(source: SourceCatalogItem, language: Language): string {
  const direct = METHOD_DESCRIPTIONS[language][source.slug];
  if (direct) return direct;
  if (language === "tr") {
    if (source.category === "benchmark") return "Benchmark sonuçları, sıralamalar ve karşılaştırma verileri.";
    if (source.category === "research") return "Araştırma yayınları, makaleler ve teknik çalışmalar.";
    if (source.category === "model_code") return "Model kartları, sürümler, ağırlıklar ve lisans bilgileri.";
    if (source.category === "company") return "Resmî duyurular, ürün güncellemeleri ve dokümantasyon.";
    if (source.category === "market") return "Pazar, fiyat ve sağlayıcı performans verileri.";
    return `${source.collection_method.toUpperCase()} yöntemiyle doğrulanan kaynak verileri.`;
  }
  if (source.category === "benchmark") return "Benchmark results, rankings, and comparison data.";
  if (source.category === "research") return "Research publications, papers, and technical studies.";
  if (source.category === "model_code") return "Model cards, releases, weights, and license information.";
  if (source.category === "company") return "Official announcements, product updates, and documentation.";
  if (source.category === "market") return "Market, pricing, and provider performance data.";
  return `Source data verified via the ${source.collection_method.toUpperCase()} method.`;
}

function sourceBadge(source: SourceCatalogItem, language: Language): { label: string; tone: string } {
  const catalogSources = ["huggingface", "ollama", "lm_studio", "github", "openrouter"];
  if (language === "tr") {
    if (source.category === "model_code" || catalogSources.some(slug => source.slug.includes(slug))) {
      return { label: "Model katalogları", tone: "blue" };
    }
    if (source.source_class === "official") return { label: "Resmî kaynaklar", tone: "green" };
    if (source.category === "benchmark") return { label: "Bağımsız değerlendirme", tone: "purple" };
    if (source.category === "research") return { label: "Araştırma kaynakları", tone: "purple" };
    if (source.source_class === "community") return { label: "Topluluk kaynağı", tone: "amber" };
    return { label: "Bağımsız kaynak", tone: "purple" };
  }
  if (source.category === "model_code" || catalogSources.some(slug => source.slug.includes(slug))) {
    return { label: "Model catalogs", tone: "blue" };
  }
  if (source.source_class === "official") return { label: "Official sources", tone: "green" };
  if (source.category === "benchmark") return { label: "Independent evaluation", tone: "purple" };
  if (source.category === "research") return { label: "Research sources", tone: "purple" };
  if (source.source_class === "community") return { label: "Community source", tone: "amber" };
  return { label: "Independent source", tone: "purple" };
}

function sourceLogoFallbacks(source: SourceCatalogItem): string[] {
  if (source.slug === "mmlu-pro") return ["huggingface"];
  if (source.slug === "swe-bench-live") return ["github"];
  return [];
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function relativeTime(value: string | null, referenceTime: number, language: Language): string {
  if (language === "tr") {
    if (!value || !referenceTime) return "Henüz kontrol yok";
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "Henüz kontrol yok";
    const minutes = Math.max(0, Math.floor((referenceTime - timestamp) / 60_000));
    if (minutes < 1) return "Az önce";
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} saat önce`;
    const days = Math.floor(hours / 24);
    return `${days} gün önce`;
  }
  if (!value || !referenceTime) return "No checks yet";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "No checks yet";
  const minutes = Math.max(0, Math.floor((referenceTime - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function sourceStatus(source: SourceCatalogItem, language: Language): { label: string; tone: string } {
  if (language === "tr") {
    if (!source.configured || source.status === "not_configured") {
      return { label: "Yapılandırılmadı", tone: "idle" };
    }
    if (!source.is_active) return { label: "Devre dışı", tone: "idle" };
    if (source.status === "error" || source.status === "failed") return { label: "Hata", tone: "error" };
    return { label: "Aktif", tone: "active" };
  }
  if (!source.configured || source.status === "not_configured") {
    return { label: "Not configured", tone: "idle" };
  }
  if (!source.is_active) return { label: "Disabled", tone: "idle" };
  if (source.status === "error" || source.status === "failed") return { label: "Error", tone: "error" };
  return { label: "Active", tone: "active" };
}

const STRINGS: Record<Language, {
  breadcrumbIntelligence: string;
  breadcrumbSources: string;
  title: string;
  subtitle: string;
  offline: string;
  live: string;
  totalSources: string;
  lastUpdate: string;
  refreshSources: string;
  searchPlaceholder: string;
  searchAria: string;
  catalogTitle: string;
  colSource: string;
  colClass: string;
  colMethod: string;
  colTrust: string;
  colStatus: string;
  openSource: (name: string) => string;
  catalogUnavailable: string;
  noMatches: string;
  loading: string;
}> = {
  tr: {
    breadcrumbIntelligence: "İSTİHBARAT",
    breadcrumbSources: "KAYNAKLAR",
    title: "Kaynaklar",
    subtitle: "LLM Radar verilerini hangi kaynaklardan topladığımızı, nasıl işlediğimizi ve ne sıklıkla güncellediğimizi gösteririz.",
    offline: "BAĞLANTI YOK",
    live: "CANLI",
    totalSources: "Toplam kaynak",
    lastUpdate: "Son güncelleme",
    refreshSources: "Kaynakları yenile",
    searchPlaceholder: "Kaynak ara...",
    searchAria: "Kaynak ara",
    catalogTitle: "KAYNAK KATALOĞU",
    colSource: "KAYNAK",
    colClass: "SINIF",
    colMethod: "YÖNTEM",
    colTrust: "GÜVEN",
    colStatus: "DURUM",
    openSource: (name) => `${name} kaynağını aç`,
    catalogUnavailable: "Kaynak kataloğu şu anda alınamıyor.",
    noMatches: "Aramanızla eşleşen kaynak bulunamadı.",
    loading: "Kaynaklar yükleniyor…",
  },
  en: {
    breadcrumbIntelligence: "INTELLIGENCE",
    breadcrumbSources: "SOURCES",
    title: "Sources",
    subtitle: "We show which sources we collect LLM Radar data from, how we process it, and how often we update it.",
    offline: "OFFLINE",
    live: "LIVE",
    totalSources: "Total sources",
    lastUpdate: "Last update",
    refreshSources: "Refresh sources",
    searchPlaceholder: "Search sources...",
    searchAria: "Search sources",
    catalogTitle: "SOURCE CATALOG",
    colSource: "SOURCE",
    colClass: "CLASS",
    colMethod: "METHOD",
    colTrust: "TRUST",
    colStatus: "STATUS",
    openSource: (name) => `Open ${name} source`,
    catalogUnavailable: "The source catalog can't be retrieved right now.",
    noMatches: "No sources match your search.",
    loading: "Loading sources…",
  },
};

export default function SourcesPage({ api }: Props) {
  const { language, locale } = useLanguage();
  const t = STRINGS[language];
  const [sources, setSources] = useState<SourceCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [requestId, setRequestId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/api/v1/catalog/sources`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Failed to fetch source catalog");
        return response.json();
      })
      .then(data => {
        setSources(data?.items ?? []);
        setFetchedAt(Date.now());
        setLoadFailed(false);
        setLoading(false);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, requestId]);

  const filteredSources = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (!needle) return sources;
    return sources.filter(source =>
      [source.name, source.url, source.category, source.source_class, source.collection_method]
        .some(value => value.toLocaleLowerCase(locale).includes(needle)),
    );
  }, [query, sources, locale]);

  const latestSuccess = useMemo(() => {
    return sources
      .map(source => source.last_success_at ? new Date(source.last_success_at).getTime() : 0)
      .filter(Number.isFinite)
      .reduce((latest, value) => Math.max(latest, value), 0);
  }, [sources]);

  const refresh = () => {
    setLoading(true);
    setRequestId(value => value + 1);
  };

  return (
    <section className="src-page app-page" id="sources">
      <header className="src-hero">
        <div className="src-heading">
          <p className="src-breadcrumb"><span>{t.breadcrumbIntelligence}</span><b>›</b><strong>{t.breadcrumbSources}</strong></p>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <span className={`src-live ${loadFailed ? "offline" : ""}`}><i />{loadFailed ? t.offline : t.live}</span>
      </header>

      <div className="src-summary-row">
        <article className="src-summary-card">
          <span className="src-summary-icon">⬡</span>
          <div><strong>{loading && !sources.length ? "—" : sources.length}</strong><small>{t.totalSources}</small></div>
        </article>
        <article className="src-summary-card src-update-card">
          <div><small>{t.lastUpdate}</small><strong>{relativeTime(latestSuccess ? new Date(latestSuccess).toISOString() : null, fetchedAt, language)}</strong></div>
          <button type="button" onClick={refresh} disabled={loading} aria-label={t.refreshSources}>↻</button>
        </article>
      </div>

      <div className="src-toolbar">
        <label className="src-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchAria} />
        </label>
      </div>

      <div className="src-catalog">
        <div className="src-catalog-title">{t.catalogTitle}</div>
        <div className="src-table-head">
          <span>{t.colSource}</span><span>{t.colClass}</span><span>{t.colMethod}</span><span>{t.colTrust}</span><span>{t.colStatus}</span><span />
        </div>
        <div className="src-table-body">
          {filteredSources.map(source => {
            const badge = sourceBadge(source, language);
            const status = sourceStatus(source, language);
            const publicUrl = source.public_url || source.url;
            return (
              <article className="src-row" key={source.slug}>
                <a className="src-source-cell" href={publicUrl} target="_blank" rel="noreferrer">
                  <span className="src-source-mark" aria-hidden="true">
                    <ModelAvatar
                      name={source.name}
                      companyName={source.name}
                      companySlug={source.slug}
                      websiteUrl={publicUrl}
                      fallbackSlugs={sourceLogoFallbacks(source)}
                    />
                  </span>
                  <div><strong>{source.name}</strong><small>{hostname(publicUrl)}</small></div>
                </a>
                <div><span className={`src-class-badge ${badge.tone}`}>{badge.label}</span></div>
                <p className="src-method">{sourceDescription(source, language)}</p>
                <time>{relativeTime(source.last_success_at, fetchedAt, language)}</time>
                <span className={`src-status ${status.tone}`}><i />{status.label}</span>
                <a className="src-open" href={publicUrl} target="_blank" rel="noreferrer" aria-label={t.openSource(source.name)}>›</a>
              </article>
            );
          })}
          {!loading && !filteredSources.length && (
            <div className="src-empty">{loadFailed ? t.catalogUnavailable : t.noMatches}</div>
          )}
          {loading && !sources.length && <div className="src-empty">{t.loading}</div>}
        </div>
      </div>
    </section>
  );
}
