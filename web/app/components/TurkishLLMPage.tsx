"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage, type Language } from "../lib/i18n";

export type TurkishModel = {
  id: string;
  name: string;
  organization: string;
  base_model: string | null;
  technique?: string | null;
  datasets?: string[];
  license: string | null;
  openness: string | null;
  tags: string[];
  downloads: number | null;
  published_at?: string | null;
  last_updated: string;
  source_url?: string | null;
};

type SortField = "name" | "downloads" | "published_at";

const PAGE_SIZE = 20;

function compact(value: number | null, locale: string): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale);
}

function formatDataset(datasets: string[] | undefined): string {
  if (!datasets?.length) return "";
  const first = datasets[0];
  return datasets.length > 1 ? `${first} +${datasets.length - 1}` : first;
}

function matchesQuery(model: TurkishModel, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    model.name,
    model.organization,
    model.technique ?? "",
    model.base_model ?? "",
    ...(model.datasets ?? []),
  ].some(field => field.toLowerCase().includes(q));
}

function isOpenWeight(model: TurkishModel): boolean {
  return model.tags.includes("Open Weight")
    || model.openness === "open_weight"
    || model.openness === "open_source";
}

type TurkishRadarItem = {
  rank: number;
  model_name: string;
  organization: string;
  score: number;
  coverage: number;
  benchmark_count: number;
  category_count: number;
};

type TurkishRadarData = {
  eligible_count: number;
  items: TurkishRadarItem[];
};

type TurkishRadarRawItem = Omit<TurkishRadarItem, "rank" | "score"> & {
  rank: number | null;
  score: number | null;
};

type Props = {
  api: string;
  bootstrap?: TurkishModel[] | null;
};

const STRINGS: Record<Language, {
  title: string;
  lead: string;
  models: string;
  openWeight: string;
  radarTitle: string;
  radarHow: string;
  radarExplain: string;
  category: string;
  coverage: string;
  searchPlaceholder: string;
  sortLabel: string;
  sortDownloads: string;
  sortRecent: string;
  sortName: string;
  clear: string;
  loading: string;
  noneMatch: string;
  noneYet: string;
  openSourceLink: (name: string) => string;
  colModel: string;
  colOrg: string;
  colTechnique: string;
  colDownloads: string;
  colPublished: string;
  prev: string;
  next: string;
}> = {
  tr: {
    title: "Türkçe odaklı modeller",
    lead: "Yerel geliştiriciler ve açık ağırlıklı modeller.",
    models: "model",
    openWeight: "open-weight",
    radarTitle: "Türkiye LLM Skoru",
    radarHow: "Nasıl hesaplanıyor?",
    radarExplain: "LLM Radar Skoru ile aynı motor, aynı kurallarla — yalnızca Türkiye sinyali taşıyan modellere uygulanır. Ayrı bir Türkçe değerlendirme paketi değildir.",
    category: "kategori",
    coverage: "kapsam",
    searchPlaceholder: "Model, geliştirici veya teknik ara",
    sortLabel: "Sırala",
    sortDownloads: "En çok indirilen",
    sortRecent: "Yayın tarihi",
    sortName: "Ada göre",
    clear: "Temizle",
    loading: "Modeller yükleniyor…",
    noneMatch: "Filtrelere uyan model yok.",
    noneYet: "Henüz model bulunamadı.",
    openSourceLink: (name) => `${name} model sayfasını aç`,
    colModel: "Model adı",
    colOrg: "Geliştiren",
    colTechnique: "Model tekniği",
    colDownloads: "İndirme sayısı",
    colPublished: "Yayın tarihi",
    prev: "Önceki",
    next: "Sonraki",
  },
  en: {
    title: "Turkish-focused models",
    lead: "Local developers and open-weight models.",
    models: "models",
    openWeight: "open-weight",
    radarTitle: "Turkey LLM Score",
    radarHow: "How is it calculated?",
    radarExplain: "The same engine and rules as the LLM Radar Score — applied only to models carrying a Turkey signal. It is not a separate Turkish evaluation suite.",
    category: "categories",
    coverage: "coverage",
    searchPlaceholder: "Search model, developer, or technique",
    sortLabel: "Sort",
    sortDownloads: "Most downloaded",
    sortRecent: "Publish date",
    sortName: "By name",
    clear: "Clear",
    loading: "Loading models…",
    noneMatch: "No models match the filters.",
    noneYet: "No models found yet.",
    openSourceLink: (name) => `Open model page for ${name}`,
    colModel: "Model name",
    colOrg: "Developer",
    colTechnique: "Technique",
    colDownloads: "Downloads",
    colPublished: "Published",
    prev: "Previous",
    next: "Next",
  },
};

function normalizeTurkishItems(items: TurkishModel[]): TurkishModel[] {
  return items.map(item => ({
    ...item,
    tags: item.tags?.length ? item.tags : ["TR"],
    datasets: item.datasets ?? [],
  }));
}

export default function TurkishLLMPage({ api, bootstrap = null }: Props) {
  const { language, locale } = useLanguage();
  const t = STRINGS[language];
  const bootReady = bootstrap !== null && bootstrap.length > 0;
  const [items, setItems] = useState<TurkishModel[]>(() => (bootstrap ? normalizeTurkishItems(bootstrap) : []));
  const [loading, setLoading] = useState(!bootReady);
  const skipInitialFetchRef = useRef(bootReady);
  const [query, setQuery] = useState("");
  const [openWeightOnly, setOpenWeightOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("downloads");
  const [page, setPage] = useState(1);
  const [radar, setRadar] = useState<TurkishRadarData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/api/v1/insights/radar-score?origin=turkish&limit=10`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!data) return;
        const scored = ((data.items ?? []) as TurkishRadarRawItem[])
          .filter((item): item is TurkishRadarItem => item.score != null && item.rank != null);
        setRadar({ eligible_count: data.eligible_count, items: scored });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    if (!bootstrap?.length) return;
    setItems(normalizeTurkishItems(bootstrap));
    setLoading(false);
    skipInitialFetchRef.current = true;
  }, [bootstrap]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    const controller = new AbortController();
    setLoading(items.length === 0);
    fetch(`${api}/api/v1/models/turkish?limit=200`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (data?.items) {
          setItems(normalizeTurkishItems(data.items as TurkishModel[]));
          setPage(1);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [api]);

  const stats = useMemo(() => ({
    total: items.length,
    openWeight: items.filter(isOpenWeight).length,
  }), [items]);

  const filtered = useMemo(() => {
    let rows = items.filter(item => matchesQuery(item, query));
    if (openWeightOnly) rows = rows.filter(isOpenWeight);

    rows.sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name, "tr");
      if (sortField === "published_at") {
        const aTime = new Date(a.published_at || a.last_updated).getTime();
        const bTime = new Date(b.published_at || b.last_updated).getTime();
        return bTime - aTime;
      }
      return (b.downloads ?? 0) - (a.downloads ?? 0);
    });
    return rows;
  }, [items, query, openWeightOnly, sortField]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersOn = openWeightOnly || query.trim().length > 0;

  return (
    <section className="turkish-page" id="turkish">
      <header className="turkish-hero">
        <div>
          <h2>{t.title}</h2>
          <p className="turkish-lead">{t.lead}</p>
        </div>
        <div className="turkish-stats">
          <div>
            <strong>{loading ? "—" : stats.total}</strong>
            <span>{t.models}</span>
          </div>
          <div>
            <strong>{loading ? "—" : stats.openWeight}</strong>
            <span>{t.openWeight}</span>
          </div>
        </div>
      </header>

      {radar?.items.length ? (
        <section className="turkish-radar" aria-label={t.radarTitle}>
          <header className="turkish-radar-head">
            <h3>{t.radarTitle}</h3>
            <details className="turkish-radar-info">
              <summary>{t.radarHow}</summary>
              <p>{t.radarExplain}</p>
            </details>
          </header>
          <ol className="turkish-radar-list">
            {radar.items.map(item => (
              <li key={`${item.organization}:${item.model_name}`}>
                <b>#{item.rank}</b>
                <span>
                  <strong>{item.model_name}</strong>
                  <small>{item.organization} · {item.benchmark_count} benchmark / {item.category_count} {t.category}</small>
                </span>
                <em>{item.score.toLocaleString(locale, { maximumFractionDigits: 1 })}<small>%{item.coverage} {t.coverage}</small></em>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="turkish-toolbar">
        <label className="turkish-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1); }}
            placeholder={t.searchPlaceholder}
          />
        </label>
        <select
          className="turkish-select"
          value={sortField}
          onChange={event => { setSortField(event.target.value as SortField); setPage(1); }}
          aria-label={t.sortLabel}
        >
          <option value="downloads">{t.sortDownloads}</option>
          <option value="published_at">{t.sortRecent}</option>
          <option value="name">{t.sortName}</option>
        </select>
        <button
          type="button"
          className={`turkish-chip${openWeightOnly ? " on" : ""}`}
          onClick={() => { setOpenWeightOnly(value => !value); setPage(1); }}
        >
          Open-weight
        </button>
        {filtersOn && (
          <button
            type="button"
            className="turkish-reset"
            onClick={() => { setQuery(""); setOpenWeightOnly(false); setPage(1); }}
          >
            {t.clear}
          </button>
        )}
      </div>

      <div className="turkish-table-wrap">
        {loading ? (
          <p className="turkish-msg">{t.loading}</p>
        ) : visible.length ? (
          <div className="turkish-scroll">
            <table className="turkish-table">
              <thead>
                <tr>
                  <th>{t.colModel}</th>
                  <th>{t.colOrg}</th>
                  <th>{t.colTechnique}</th>
                  <th>{t.colDownloads}</th>
                  <th>{t.colPublished}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(model => {
                  const dataset = formatDataset(model.datasets);
                  return (
                    <tr key={model.id}>
                      <td>
                        {model.source_url ? (
                          <a
                            className="turkish-model-link"
                            href={model.source_url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t.openSourceLink(model.name)}
                          >
                            <strong title={model.name}>{model.name}</strong>
                            <span aria-hidden="true">↗</span>
                          </a>
                        ) : (
                          <strong title={model.name}>{model.name}</strong>
                        )}
                        {dataset && (
                          <div className="turkish-row-sub">
                            <span className="turkish-dataset" title={model.datasets?.join(", ")}>
                              {dataset}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>{model.organization}</td>
                      <td>
                        <span className="turkish-technique">{model.technique ?? "—"}</span>
                        {model.base_model && (
                          <div className="turkish-row-sub">
                            <span className="turkish-base" title={model.base_model}>
                              {model.base_model}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="mono turkish-num">{compact(model.downloads, locale)}</td>
                      <td className="turkish-muted">
                        {formatDate(model.published_at || model.last_updated, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="turkish-msg">
            {items.length ? t.noneMatch : t.noneYet}
          </p>
        )}
      </div>

      {pages > 1 && (
        <footer className="turkish-pager">
          <button type="button" disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>
            {t.prev}
          </button>
          <span>{safePage} / {pages}</span>
          <button type="button" disabled={safePage === pages} onClick={() => setPage(p => p + 1)}>
            {t.next}
          </button>
        </footer>
      )}
    </section>
  );
}
