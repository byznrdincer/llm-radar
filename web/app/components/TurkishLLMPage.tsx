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
type BrowseMode = "year" | "technique" | "organization" | "list";
type GroupKey = { mode: Exclude<BrowseMode, "list">; value: string };

type ModelGroup = {
  key: string;
  label: string;
  models: TurkishModel[];
};

const PAGE_SIZE = 20;
const CHIP_PREVIEW = 6;

const TECHNIQUE_ORDER = [
  "Base",
  "Fine-tuned",
  "Embedding",
  "Encoder",
  "Pretrained",
  "Reranker",
  "Quantized",
];

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

function modelYear(model: TurkishModel): string | null {
  const raw = model.published_at || model.last_updated;
  if (!raw) return null;
  const year = new Date(raw).getFullYear();
  return Number.isFinite(year) ? String(year) : null;
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

function matchesGroup(model: TurkishModel, group: GroupKey | null, unknownLabel: string): boolean {
  if (!group) return true;
  if (group.mode === "year") {
    return (modelYear(model) ?? unknownLabel) === group.value;
  }
  if (group.mode === "technique") {
    return (model.technique?.trim() || unknownLabel) === group.value;
  }
  return model.organization === group.value;
}

function sortModels(rows: TurkishModel[], sortField: SortField): TurkishModel[] {
  return [...rows].sort((a, b) => {
    if (sortField === "name") return a.name.localeCompare(b.name, "tr");
    if (sortField === "published_at") {
      const aTime = new Date(a.published_at || a.last_updated).getTime();
      const bTime = new Date(b.published_at || b.last_updated).getTime();
      return bTime - aTime;
    }
    return (b.downloads ?? 0) - (a.downloads ?? 0);
  });
}

function buildGroups(
  models: TurkishModel[],
  mode: Exclude<BrowseMode, "list">,
  unknownLabel: string,
): ModelGroup[] {
  const buckets = new Map<string, TurkishModel[]>();

  for (const model of models) {
    let key: string;
    if (mode === "year") key = modelYear(model) ?? unknownLabel;
    else if (mode === "technique") key = model.technique?.trim() || unknownLabel;
    else key = model.organization || unknownLabel;

    const list = buckets.get(key);
    if (list) list.push(model);
    else buckets.set(key, [model]);
  }

  const entries = [...buckets.entries()].map(([key, groupModels]) => ({
    key,
    label: key,
    models: sortModels(groupModels, "downloads"),
  }));

  if (mode === "year") {
    return entries.sort((a, b) => {
      if (a.key === unknownLabel) return 1;
      if (b.key === unknownLabel) return -1;
      return Number(b.key) - Number(a.key);
    });
  }

  if (mode === "technique") {
    return entries.sort((a, b) => {
      const ai = TECHNIQUE_ORDER.indexOf(a.key);
      const bi = TECHNIQUE_ORDER.indexOf(b.key);
      const aRank = a.key === unknownLabel ? 999 : ai === -1 ? 100 : ai;
      const bRank = b.key === unknownLabel ? 999 : bi === -1 ? 100 : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a.label.localeCompare(b.label, "tr");
    });
  }

  return entries.sort((a, b) => {
    if (b.models.length !== a.models.length) return b.models.length - a.models.length;
    return a.label.localeCompare(b.label, "tr");
  });
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
  viewYear: string;
  viewTechnique: string;
  viewOrg: string;
  viewList: string;
  unknown: string;
  groupModels: (count: number) => string;
  moreModels: (count: number) => string;
  openGroup: string;
  activeGroup: string;
  clearGroup: string;
}> = {
  tr: {
    title: "Türkçe odaklı modeller",
    lead: "Yıl, teknik ve geliştiriciye göre sınıflandırılmış yerel modeller.",
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
    viewYear: "Yıla göre",
    viewTechnique: "Tekniğe göre",
    viewOrg: "Geliştiriciye göre",
    viewList: "Liste",
    unknown: "Bilinmiyor",
    groupModels: (count) => `${count} model`,
    moreModels: (count) => `+${count} daha`,
    openGroup: "Listele",
    activeGroup: "Aktif grup",
    clearGroup: "Grubu kaldır",
  },
  en: {
    title: "Turkish-focused models",
    lead: "Local models classified by year, technique, and developer.",
    models: "models",
    openWeight: "open-weight",
    radarTitle: "Turkey LLM Score",
    radarHow: "How is it calculated?",
    radarExplain: "The same engine and rules as the LLM Radar Score — applied only to models carrying a Turkey signal. It is not a separate Turkish evaluation suite.",
    category: "categories",
    coverage: "coverage",
    searchPlaceholder: "Search model, developer, or technique",
    sortLabel: "Sort",
    sortDownloads: "Most downloads",
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
    viewYear: "By year",
    viewTechnique: "By technique",
    viewOrg: "By developer",
    viewList: "List",
    unknown: "Unknown",
    groupModels: (count) => `${count} models`,
    moreModels: (count) => `+${count} more`,
    openGroup: "Show list",
    activeGroup: "Active group",
    clearGroup: "Clear group",
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
  const [browseMode, setBrowseMode] = useState<BrowseMode>("year");
  const [groupFilter, setGroupFilter] = useState<GroupKey | null>(null);
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
    fetch(`${api}/api/v1/models/turkish?limit=500`, { signal: controller.signal })
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

  const baseFiltered = useMemo(() => {
    let rows = items.filter(item => matchesQuery(item, query));
    if (openWeightOnly) rows = rows.filter(isOpenWeight);
    return rows;
  }, [items, query, openWeightOnly]);

  const filtered = useMemo(() => {
    const rows = baseFiltered.filter(item => matchesGroup(item, groupFilter, t.unknown));
    return sortModels(rows, sortField);
  }, [baseFiltered, groupFilter, sortField, t.unknown]);

  const groups = useMemo(() => {
    if (browseMode === "list") return [];
    return buildGroups(baseFiltered, browseMode, t.unknown);
  }, [baseFiltered, browseMode, t.unknown]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersOn = openWeightOnly || query.trim().length > 0 || groupFilter != null;

  function selectBrowseMode(mode: BrowseMode) {
    setBrowseMode(mode);
    setPage(1);
  }

  function openGroup(mode: Exclude<BrowseMode, "list">, value: string) {
    setGroupFilter({ mode, value });
    setBrowseMode("list");
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setOpenWeightOnly(false);
    setGroupFilter(null);
    setPage(1);
  }

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

      <div className="turkish-views" role="tablist" aria-label={language === "tr" ? "Görünüm" : "View"}>
        {([
          ["year", t.viewYear],
          ["technique", t.viewTechnique],
          ["organization", t.viewOrg],
          ["list", t.viewList],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={browseMode === mode}
            className={`turkish-view-tab${browseMode === mode ? " on" : ""}`}
            onClick={() => selectBrowseMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="turkish-toolbar">
        <label className="turkish-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1); }}
            placeholder={t.searchPlaceholder}
          />
        </label>
        {browseMode === "list" && (
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
        )}
        <button
          type="button"
          className={`turkish-chip${openWeightOnly ? " on" : ""}`}
          onClick={() => { setOpenWeightOnly(value => !value); setPage(1); }}
        >
          Open-weight
        </button>
        {groupFilter && (
          <button
            type="button"
            className="turkish-chip on"
            onClick={() => { setGroupFilter(null); setPage(1); }}
            title={t.clearGroup}
          >
            {t.activeGroup}: {groupFilter.value}
          </button>
        )}
        {filtersOn && (
          <button type="button" className="turkish-reset" onClick={clearFilters}>
            {t.clear}
          </button>
        )}
      </div>

      {browseMode !== "list" ? (
        <div className="turkish-browse">
          {loading ? (
            <p className="turkish-msg">{t.loading}</p>
          ) : groups.length ? (
            <div className="turkish-group-grid">
              {groups.map(group => {
                const preview = group.models.slice(0, CHIP_PREVIEW);
                const rest = group.models.length - preview.length;
                const selected = groupFilter?.mode === browseMode && groupFilter.value === group.key;
                return (
                  <article
                    key={group.key}
                    className={`turkish-group-card${selected ? " on" : ""}`}
                  >
                    <header className="turkish-group-head">
                      <div>
                        <h3>{group.label}</h3>
                        <p>{t.groupModels(group.models.length)}</p>
                      </div>
                      <button
                        type="button"
                        className="turkish-group-open"
                        onClick={() => openGroup(browseMode, group.key)}
                      >
                        {t.openGroup}
                      </button>
                    </header>
                    <ul className="turkish-group-chips">
                      {preview.map(model => (
                        <li key={model.id}>
                          {model.source_url ? (
                            <a
                              href={model.source_url}
                              target="_blank"
                              rel="noreferrer"
                              title={model.name}
                              aria-label={t.openSourceLink(model.name)}
                            >
                              {model.name}
                            </a>
                          ) : (
                            <span title={model.name}>{model.name}</span>
                          )}
                        </li>
                      ))}
                      {rest > 0 && (
                        <li>
                          <button
                            type="button"
                            className="turkish-group-more"
                            onClick={() => openGroup(browseMode, group.key)}
                          >
                            {t.moreModels(rest)}
                          </button>
                        </li>
                      )}
                    </ul>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="turkish-msg">
              {items.length ? t.noneMatch : t.noneYet}
            </p>
          )}
        </div>
      ) : (
        <>
          {radar?.items.length ? (
            <details className="turkish-radar">
              <summary>
                <span>{t.radarTitle}</span>
                <small>{radar.items[0]?.model_name} · {radar.items[0]?.score.toLocaleString(locale, { maximumFractionDigits: 1 })}</small>
              </summary>
              <p className="turkish-radar-explain">{t.radarExplain}</p>
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
            </details>
          ) : null}

          <div className="turkish-list-wrap">
            {loading ? (
              <p className="turkish-msg">{t.loading}</p>
            ) : visible.length ? (
              <ul className="turkish-list">
                {visible.map(model => {
                  const dataset = formatDataset(model.datasets);
                  const published = formatDate(model.published_at || model.last_updated, locale);
                  const year = modelYear(model);
                  return (
                    <li key={model.id} className="turkish-list-card">
                      <div className="turkish-list-main">
                        <div className="turkish-list-title">
                          {model.source_url ? (
                            <a
                              className="turkish-model-link"
                              href={model.source_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t.openSourceLink(model.name)}
                            >
                              <strong title={model.name}>{model.name}</strong>
                              <span className="turkish-ext" aria-hidden="true">
                                <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                                  <path d="M6.5 3.5H3.5v9h9V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M8.5 3.5H12.5V7.5M12.5 3.5 7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            </a>
                          ) : (
                            <strong title={model.name}>{model.name}</strong>
                          )}
                          <button
                            type="button"
                            className="turkish-org-link"
                            onClick={() => openGroup("organization", model.organization)}
                          >
                            {model.organization}
                          </button>
                        </div>
                        <div className="turkish-list-meta">
                          {model.technique ? (
                            <button
                              type="button"
                              className="turkish-pill turkish-pill-tech"
                              onClick={() => openGroup("technique", model.technique!)}
                            >
                              {model.technique}
                            </button>
                          ) : null}
                          {year ? (
                            <button
                              type="button"
                              className="turkish-pill"
                              onClick={() => openGroup("year", year)}
                            >
                              {year}
                            </button>
                          ) : null}
                          {dataset ? (
                            <span className="turkish-pill turkish-pill-soft" title={model.datasets?.join(", ")}>
                              {dataset}
                            </span>
                          ) : null}
                          {model.base_model ? (
                            <span className="turkish-pill turkish-pill-soft" title={model.base_model}>
                              {model.base_model}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="turkish-list-stats">
                        <div>
                          <strong className="mono">{compact(model.downloads, locale)}</strong>
                          <span>{t.colDownloads}</span>
                        </div>
                        <div>
                          <strong>{published}</strong>
                          <span>{t.colPublished}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
        </>
      )}
    </section>
  );
}
