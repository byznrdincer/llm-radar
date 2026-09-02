"use client";

import { useEffect, useMemo, useState } from "react";
import ModelAvatar from "./ModelAvatar";

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

const METHOD_DESCRIPTIONS: Record<string, string> = {
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
};

function sourceDescription(source: SourceCatalogItem): string {
  const direct = METHOD_DESCRIPTIONS[source.slug];
  if (direct) return direct;
  if (source.category === "benchmark") return "Benchmark sonuçları, sıralamalar ve karşılaştırma verileri.";
  if (source.category === "research") return "Araştırma yayınları, makaleler ve teknik çalışmalar.";
  if (source.category === "model_code") return "Model kartları, sürümler, ağırlıklar ve lisans bilgileri.";
  if (source.category === "company") return "Resmî duyurular, ürün güncellemeleri ve dokümantasyon.";
  if (source.category === "market") return "Pazar, fiyat ve sağlayıcı performans verileri.";
  return `${source.collection_method.toUpperCase()} yöntemiyle doğrulanan kaynak verileri.`;
}

function sourceBadge(source: SourceCatalogItem): { label: string; tone: string } {
  const catalogSources = ["huggingface", "ollama", "lm_studio", "github", "openrouter"];
  if (source.category === "model_code" || catalogSources.some(slug => source.slug.includes(slug))) {
    return { label: "Model katalogları", tone: "blue" };
  }
  if (source.source_class === "official") return { label: "Resmî kaynaklar", tone: "green" };
  if (source.category === "benchmark") return { label: "Bağımsız değerlendirme", tone: "purple" };
  if (source.category === "research") return { label: "Araştırma kaynakları", tone: "purple" };
  if (source.source_class === "community") return { label: "Topluluk kaynağı", tone: "amber" };
  return { label: "Bağımsız kaynak", tone: "purple" };
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

function relativeTime(value: string | null, referenceTime: number): string {
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

function sourceStatus(source: SourceCatalogItem): { label: string; tone: string } {
  if (!source.configured || source.status === "not_configured") {
    return { label: "Yapılandırılmadı", tone: "idle" };
  }
  if (!source.is_active) return { label: "Devre dışı", tone: "idle" };
  if (source.status === "error" || source.status === "failed") return { label: "Hata", tone: "error" };
  return { label: "Aktif", tone: "active" };
}

export default function SourcesPage({ api }: Props) {
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
        if (!response.ok) throw new Error("Kaynak kataloğu alınamadı");
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
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return sources;
    return sources.filter(source =>
      [source.name, source.url, source.category, source.source_class, source.collection_method]
        .some(value => value.toLocaleLowerCase("tr-TR").includes(needle)),
    );
  }, [query, sources]);

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
          <p className="src-breadcrumb"><span>İSTİHBARAT</span><b>›</b><strong>KAYNAKLAR</strong></p>
          <h1>Kaynaklar</h1>
          <p>LLM Radar verilerini hangi kaynaklardan topladığımızı, nasıl işlediğimizi ve ne sıklıkla güncellediğimizi gösteririz.</p>
        </div>
        <span className={`src-live ${loadFailed ? "offline" : ""}`}><i />{loadFailed ? "BAĞLANTI YOK" : "CANLI"}</span>
      </header>

      <div className="src-summary-row">
        <article className="src-summary-card">
          <span className="src-summary-icon">⬡</span>
          <div><strong>{loading && !sources.length ? "—" : sources.length}</strong><small>Toplam kaynak</small></div>
        </article>
        <article className="src-summary-card src-update-card">
          <div><small>Son güncelleme</small><strong>{relativeTime(latestSuccess ? new Date(latestSuccess).toISOString() : null, fetchedAt)}</strong></div>
          <button type="button" onClick={refresh} disabled={loading} aria-label="Kaynakları yenile">↻</button>
        </article>
      </div>

      <div className="src-toolbar">
        <label className="src-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Kaynak ara..." aria-label="Kaynak ara" />
        </label>
      </div>

      <div className="src-catalog">
        <div className="src-catalog-title">KAYNAK KATALOĞU</div>
        <div className="src-table-head">
          <span>KAYNAK</span><span>SINIF</span><span>YÖNTEM</span><span>GÜVEN</span><span>DURUM</span><span />
        </div>
        <div className="src-table-body">
          {filteredSources.map(source => {
            const badge = sourceBadge(source);
            const status = sourceStatus(source);
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
                <p className="src-method">{sourceDescription(source)}</p>
                <time>{relativeTime(source.last_success_at, fetchedAt)}</time>
                <span className={`src-status ${status.tone}`}><i />{status.label}</span>
                <a className="src-open" href={publicUrl} target="_blank" rel="noreferrer" aria-label={`${source.name} kaynağını aç`}>›</a>
              </article>
            );
          })}
          {!loading && !filteredSources.length && (
            <div className="src-empty">{loadFailed ? "Kaynak kataloğu şu anda alınamıyor." : "Aramanızla eşleşen kaynak bulunamadı."}</div>
          )}
          {loading && !sources.length && <div className="src-empty">Kaynaklar yükleniyor…</div>}
        </div>
      </div>
    </section>
  );
}
