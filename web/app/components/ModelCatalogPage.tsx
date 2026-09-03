"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ModelAvatar from "./ModelAvatar";
import { useInfiniteScroll } from "../lib/useInfiniteScroll";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function matchesSearchQuery(name: string, slug: string, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const compact = q.replace(/[\s_.-]+/g, "");
    const hayName = name.toLowerCase();
    const haySlug = slug.toLowerCase();
    return hayName.includes(q) || haySlug.includes(q)
        || (compact.length > 0 && (hayName.replace(/[\s_.-]+/g, "").includes(compact) || haySlug.includes(compact)));
}

type SearchSuggestionModel = {
    kind: "model";
    id: string;
    name: string;
    slug: string;
    company: { slug: string; name: string };
};

type SearchSuggestionDeveloper = {
    kind: "developer";
    slug: string;
    name: string;
};

type SearchSuggestion = SearchSuggestionModel | SearchSuggestionDeveloper;

export type CatalogModel = {
    id: string;
    slug: string;
    name: string;
    family?: string | null;
    release_date?: string | null;
    backend?: string | null;
    company: { slug: string; name: string; website_url?: string | null };
    context_window: number | null;
    capabilities: { input_modalities?: string[] };
    pricing: { input: string | null; output: string | null } | null;
    selection?: {
        benchmark_score: number;
        best_rank: number;
        advancedness_tier?: string | null;
    } | null;
};

export type CatalogFacets = {
    developers: { slug: string; name: string; count: number; website_url?: string | null }[];
    providers: { slug: string; name: string; count: number }[];
    families: { name: string; count: number }[];
    modalities: { name: string; count: number }[];
    capabilities: { name: string; count: number }[];
    licenses: { name: string; count: number }[];
};

export const ADVANCEDNESS_LABELS: Record<string, string> = {
    entry: "Giriş",
    mid: "Orta",
    advanced: "Gelişmiş",
    frontier: "Frontier",
    unscored: "Benchmark yok",
};

export const ADVANCEDNESS_OPTIONS = [
    { value: "frontier" },
    { value: "advanced" },
    { value: "mid" },
    { value: "entry" },
    { value: "unscored" },
] as const;

function advancednessBadge(model: CatalogModel) {
    const tier = model.selection?.advancedness_tier;
    const score = model.selection?.benchmark_score;
    if (!tier && score == null)
        return <span className="catalog-tier catalog-tier-na">—</span>;
    const label = tier ? (ADVANCEDNESS_LABELS[tier] ?? tier) : "—";
    return (
        <span className={`catalog-tier catalog-tier-${tier ?? "na"}`} title={score != null ? `Benchmark: ${score}` : undefined}>
            {label}
            {score != null && <small>{score}</small>}
        </span>
    );
}
export type CatalogSortBy = "name" | "provider" | "context" | "input_price" | "output_price" | "release_date" | "benchmark_score" | "backend";
export type CatalogSortOrder = "asc" | "desc";

export type CatalogSortSpec = { field: CatalogSortBy; order: CatalogSortOrder };

export const DEFAULT_SORT_STACK: CatalogSortSpec[] = [{ field: "name", order: "asc" }];

type FilterChip = { key: string; label: string; clear: () => void };

type Props = {
    loading: boolean;
    modelCount: number;
    resultTotal: number;
    profileLoading: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    developers: string[];
    onToggleDeveloper: (slug: string) => void;
    onClearDevelopers: () => void;
    companies: { slug: string; name: string; count?: number; website_url?: string | null }[];
    advancedOpen: boolean;
    onAdvancedToggle: () => void;
    advancedActive: boolean;
    sortStack: CatalogSortSpec[];
    onSort: (field: CatalogSortBy, order?: CatalogSortOrder) => void;
    sortLabels: Record<CatalogSortBy, string>;
    activeFilters: FilterChip[];
    onResetFilters: () => void;
    facets: CatalogFacets;
    minContext: string;
    onMinContextChange: (value: string) => void;
    maxInputPrice: string;
    onMaxInputPriceChange: (value: string) => void;
    maxOutputPrice: string;
    onMaxOutputPriceChange: (value: string) => void;
    providers: string[];
    onToggleProvider: (slug: string) => void;
    onClearProviders: () => void;
    openness: string[];
    licenses: string[];
    commercialStatuses: string[];
    modalities: string[];
    capabilities: string[];
    families: string[];
    advancedness: string[];
    onToggleAdvancedness: (value: string) => void;
    onClearAdvancedness: () => void;
    benchmarkFocus: string;
    onBenchmarkFocusChange: (value: string) => void;
    onToggleOpenness: (value: string) => void;
    onToggleLicense: (value: string) => void;
    onToggleCommercial: (value: string) => void;
    onToggleModality: (value: string) => void;
    onToggleCapability: (value: string) => void;
    onToggleFamily: (value: string) => void;
    runtimeCapabilityOptions: string[];
    trModality: (value: string) => string;
    trCapability: (value: string) => string;
    models: CatalogModel[];
    selectedIds: string[];
    onToggleSelect: (model: CatalogModel) => void;
    onInspect: (model: CatalogModel) => void;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    money: (value: string | null | undefined) => string;
    developerSites: Record<string, string | null | undefined>;
};

function CatalogSearchInput({ query, onQueryChange, companies, developerSites, onToggleDeveloper }: {
    query: string;
    onQueryChange: (value: string) => void;
    companies: Props["companies"];
    developerSites: Record<string, string | null | undefined>;
    onToggleDeveloper: (slug: string) => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [models, setModels] = useState<SearchSuggestionModel[]>([]);
    const [highlight, setHighlight] = useState(0);

    const developerSuggestions = useMemo(() => {
        const q = query.trim();
        if (q.length < 1) return [];
        return companies
            .filter(c => matchesSearchQuery(c.name, c.slug, q))
            .slice(0, 4)
            .map(c => ({ kind: "developer" as const, slug: c.slug, name: c.name }));
    }, [companies, query]);

    const suggestions = useMemo<SearchSuggestion[]>(
        () => [...developerSuggestions, ...models],
        [developerSuggestions, models],
    );

    useEffect(() => {
        const q = query.trim();
        if (q.length < 1) {
            setModels([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            const params = new URLSearchParams({ search: q, limit: "8", sort_by: "name", sort_order: "asc" });
            fetch(`${API}/api/v1/models/search?${params}`, { signal: controller.signal })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    const items = (data?.items ?? []) as {
                        id: string;
                        name: string;
                        slug: string;
                        developer: { slug: string; name: string };
                    }[];
                    setModels(items.map(item => ({
                        kind: "model" as const,
                        id: item.id,
                        name: item.name,
                        slug: item.slug,
                        company: { slug: item.developer.slug, name: item.developer.name },
                    })));
                })
                .catch(() => { if (!controller.signal.aborted) setModels([]); })
                .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        }, 180);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [query]);

    useEffect(() => {
        setHighlight(0);
    }, [suggestions]);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", close);
        window.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
    }, [open]);

    const pick = (item: SearchSuggestion) => {
        if (item.kind === "developer") {
            onToggleDeveloper(item.slug);
            onQueryChange("");
        } else {
            onQueryChange(item.name);
        }
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight(i => (i + 1) % suggestions.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight(i => (i - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === "Enter" && suggestions[highlight]) {
            e.preventDefault();
            pick(suggestions[highlight]);
        }
    };

    const showMenu = open && query.trim().length > 0 && (loading || suggestions.length > 0);

    return (
        <div className={`catalog-search-wrap${open ? " open" : ""}`} ref={rootRef}>
            <label className="catalog-search">
                <span aria-hidden="true">⌕</span>
                <input
                    value={query}
                    onChange={e => { onQueryChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder="Model veya geliştirici ara"
                    role="combobox"
                    aria-expanded={showMenu}
                    aria-autocomplete="list"
                    aria-controls="catalog-search-suggestions"
                />
            </label>
            {showMenu && (
                <div className="catalog-search-menu" id="catalog-search-suggestions" role="listbox">
                    {loading && suggestions.length === 0 && <p className="catalog-search-hint">Aranıyor…</p>}
                    {developerSuggestions.length > 0 && (
                        <div className="catalog-search-group">
                            <p className="catalog-search-label">Geliştiriciler</p>
                            {developerSuggestions.map((item, index) => (
                                <button
                                    key={item.slug}
                                    type="button"
                                    role="option"
                                    aria-selected={highlight === index}
                                    className={highlight === index ? "active" : ""}
                                    onMouseEnter={() => setHighlight(index)}
                                    onClick={() => pick(item)}
                                >
                                    <ModelAvatar name={item.name} companySlug={item.slug} companyName={item.name} websiteUrl={developerSites[item.slug]} size="sm" />
                                    <span>{item.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {models.length > 0 && (
                        <div className="catalog-search-group">
                            <p className="catalog-search-label">Modeller</p>
                            {models.map((item, index) => {
                                const rowIndex = developerSuggestions.length + index;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        role="option"
                                        aria-selected={highlight === rowIndex}
                                        className={highlight === rowIndex ? "active" : ""}
                                        onMouseEnter={() => setHighlight(rowIndex)}
                                        onClick={() => pick(item)}
                                    >
                                        <ModelAvatar name={item.name} companySlug={item.company.slug} companyName={item.company.name} websiteUrl={developerSites[item.company.slug]} size="sm" />
                                        <span><strong>{item.name}</strong><small>{item.company.name}</small></span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {!loading && suggestions.length === 0 && <p className="catalog-search-hint">Sonuç bulunamadı</p>}
                </div>
            )}
        </div>
    );
}

function MultiDeveloperPicker({ values, companies, onToggle, onClear, developerSites }: {
    values: string[];
    companies: Props["companies"];
    onToggle: (slug: string) => void;
    onClear: () => void;
    developerSites: Record<string, string | null | undefined>;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return companies;
        return companies.filter(c => matchesSearchQuery(c.name, c.slug, search));
    }, [companies, search]);
    const label = values.length === 0
        ? "Tüm geliştiriciler"
        : values.length === 1
            ? (companies.find(c => c.slug === values[0])?.name ?? values[0])
            : `${values.length} geliştirici`;

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", close);
        window.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
    }, [open]);

    return (
        <div className={`catalog-dev-picker${open ? " open" : ""}${values.length ? " filtered" : ""}`} ref={rootRef}>
            <button type="button" className="catalog-dev-picker-trigger" aria-expanded={open} onClick={() => setOpen(v => !v)}>
                <span>{label}</span>
                {values.length > 0 && <span className="catalog-filter-count">{values.length}</span>}
                <span aria-hidden="true">⌄</span>
            </button>
            {open && (
                <div className="catalog-dev-picker-menu catalog-col-menu-wide">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Geliştirici ara…" autoFocus />
                    <div className="catalog-dev-picker-list">
                        {values.length > 0 && (
                            <button type="button" className="catalog-filter-clear-row" onClick={() => { onClear(); setSearch(""); }}>Seçimi temizle</button>
                        )}
                        {filtered.map(c => (
                            <label key={c.slug} className={`catalog-filter-option${values.includes(c.slug) ? " active" : ""}`}>
                                <input type="checkbox" checked={values.includes(c.slug)} onChange={() => onToggle(c.slug)} />
                                <ModelAvatar name={c.name} companySlug={c.slug} companyName={c.name} websiteUrl={developerSites[c.slug]} size="sm" />
                                <span>{c.name}{c.count ? ` (${c.count})` : ""}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function MultiSelectFilter({ title, values, options, onToggle, onClear, renderLabel = v => v, className }: {
    title: string; values: string[]; options: { value: string; count?: number }[];
    onToggle: (value: string) => void; onClear?: () => void; renderLabel?: (value: string) => string; className?: string;
}) {
    const summary = values.length === 0 ? "Farketmez" : values.length <= 2 ? values.map(renderLabel).join(", ") : `${values.length} seçili`;
    return (
        <fieldset className={`multi-filter${className ? ` ${className}` : ""}`}>
            <legend>{title}</legend>
            <details>
                <summary>{summary}</summary>
                <div className="multi-filter-panel">
                    {values.length > 0 && <button type="button" className="multi-filter-clear" onClick={() => (onClear ? onClear() : values.forEach(onToggle))}>Temizle</button>}
                    <div className="multi-filter-options">
                        {options.map(item => (
                            <label key={item.value}>
                                <input type="checkbox" checked={values.includes(item.value)} onChange={() => onToggle(item.value)} />
                                <span>{renderLabel(item.value)}{item.count ? ` (${item.count})` : ""}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </details>
        </fieldset>
    );
}

function columnSortMark(stack: CatalogSortSpec[], field: CatalogSortBy) {
    const index = stack.findIndex(item => item.field === field);
    if (index < 0)
        return null;
    const order = stack[index].order === "asc" ? "↑" : "↓";
    return stack.length > 1 ? `${index + 1}${order}` : order;
}

function sortDirectionLabels(field: CatalogSortBy) {
    if (field === "name" || field === "provider")
        return { asc: "A → Z", desc: "Z → A" };
    if (field === "benchmark_score")
        return { asc: "Az gelişmişten başla", desc: "En gelişmişten başla" };
    return { asc: "Azdan çoğa", desc: "Çoktan aza" };
}

function ColumnFilterHead({ label, field, sortStack, onSort, filterActive, filterCount, children }: {
    label: string;
    field: CatalogSortBy;
    sortStack: CatalogSortSpec[];
    onSort: (field: CatalogSortBy, order?: CatalogSortOrder) => void;
    filterActive?: boolean;
    filterCount?: number;
    children?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLTableCellElement>(null);
    const mark = columnSortMark(sortStack, field);
    const activeOrder = sortStack.find(item => item.field === field)?.order;
    const directionLabels = sortDirectionLabels(field);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", close);
        window.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
    }, [open]);

    return (
        <th
            ref={rootRef}
            className={`catalog-col-head${open ? " open" : ""}`}
            aria-sort={activeOrder === "asc" ? "ascending" : activeOrder === "desc" ? "descending" : "none"}
        >
            <div className="catalog-col-head-inner">
                <button
                    type="button"
                    className={`sort-header${mark ? " active" : ""}`}
                    onClick={() => onSort(field)}
                >
                    {label}{mark && <span className="sort-mark">{mark}</span>}
                </button>
                <button
                    type="button"
                    className={`catalog-col-filter-btn${filterActive ? " on" : ""}${activeOrder ? " sorted" : ""}`}
                    aria-expanded={open}
                    aria-label={`${label} sırala${children ? " ve filtrele" : ""}`}
                    onClick={() => setOpen(v => !v)}
                >
                    {filterCount ? filterCount : "⇅"}
                </button>
            </div>
            {open && (
                <div className="catalog-col-filter-menu" onClick={e => e.stopPropagation()}>
                    <div className="catalog-sort-options" role="group" aria-label={`${label} sıralama yönü`}>
                        <button
                            type="button"
                            className={activeOrder === "asc" ? "active" : ""}
                            onClick={() => { onSort(field, "asc"); setOpen(false); }}
                        >
                            <span>{directionLabels.asc}</span><strong aria-hidden="true">↑</strong>
                        </button>
                        <button
                            type="button"
                            className={activeOrder === "desc" ? "active" : ""}
                            onClick={() => { onSort(field, "desc"); setOpen(false); }}
                        >
                            <span>{directionLabels.desc}</span><strong aria-hidden="true">↓</strong>
                        </button>
                    </div>
                    {children}
                </div>
            )}
        </th>
    );
}

function ColumnCheckboxList({ values, options, onToggle, onClear, renderLabel = v => v }: {
    values: string[];
    options: { value: string; count?: number }[];
    onToggle: (value: string) => void;
    onClear: () => void;
    renderLabel?: (value: string) => string;
}) {
    const [search, setSearch] = useState("");
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return options;
        return options.filter(o => renderLabel(o.value).toLowerCase().includes(q) || o.value.includes(q));
    }, [options, renderLabel, search]);

    return (
        <div className="catalog-col-filter-body">
            <input className="catalog-col-filter-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara…" />
            {values.length > 0 && <button type="button" className="catalog-filter-clear-row" onClick={onClear}>Temizle</button>}
            <div className="catalog-col-filter-options">
                {filtered.map(item => (
                    <label key={item.value} className={`catalog-filter-option${values.includes(item.value) ? " active" : ""}`}>
                        <input type="checkbox" checked={values.includes(item.value)} onChange={() => onToggle(item.value)} />
                        <span>{renderLabel(item.value)}{item.count ? ` (${item.count})` : ""}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

export default function ModelCatalogPage(props: Props) {
    const p = props;
    const sentinelRef = useInfiniteScroll(p.onLoadMore, p.hasMore && !p.loadingMore);
    const capOptions = useMemo(() => Array.from(new Map([
        ...p.runtimeCapabilityOptions.map(v => [v, 0] as [string, number]),
        ["reasoning", 0], ["coding", 0], ["tool_calling", 0],
        ...p.facets.capabilities.map(i => [i.name, i.count] as [string, number]),
    ]).entries()).map(([value, count]) => ({ value, count })), [p.facets.capabilities, p.runtimeCapabilityOptions]);
    const modalityOptions = useMemo(() => {
        const preferred = ["text", "image", "audio", "video", "file", "pdf"];
        const counts = new Map(p.facets.modalities.map(item => [item.name, item.count]));
        return Array.from(new Set([...preferred, ...counts.keys()])).map(value => ({
            value,
            count: counts.get(value),
        }));
    }, [p.facets.modalities]);
    const licenseOptions = useMemo(() => {
        const fallback = ["mit", "apache_2_0", "llama_community", "model_specific", "other", "unknown"];
        const values = p.facets.licenses.length ? p.facets.licenses : fallback.map(name => ({ name, count: 0 }));
        return values.map(item => ({ value: item.name, count: item.count }));
    }, [p.facets.licenses]);
    const sortSummary = p.sortStack.map(item => `${p.sortLabels[item.field]} ${item.order === "asc" ? "↑" : "↓"}`).join(" · ");

    useEffect(() => {
        if (!p.advancedOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") p.onAdvancedToggle();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [p.advancedOpen, p.onAdvancedToggle]);

    return (
        <section className="catalog-page" id="models">
            <header className="catalog-top">
                <div>
                    <p className="kicker">MODEL KATALOĞU</p>
                    <h2>{p.loading || p.profileLoading ? "Yükleniyor…" : `${p.resultTotal.toLocaleString("tr-TR")} model`}</h2>
                </div>
                <p className="catalog-meta">
                    {!p.profileLoading && p.resultTotal !== p.modelCount && `${p.modelCount.toLocaleString("tr-TR")} model içinden · `}
                    {sortSummary}
                </p>
            </header>

            <div className="catalog-bar">
                <CatalogSearchInput
                    query={p.query}
                    onQueryChange={p.onQueryChange}
                    companies={p.companies}
                    developerSites={p.developerSites}
                    onToggleDeveloper={p.onToggleDeveloper}
                />
                <MultiDeveloperPicker
                    values={p.developers}
                    companies={p.companies}
                    onToggle={p.onToggleDeveloper}
                    onClear={p.onClearDevelopers}
                    developerSites={p.developerSites}
                />
                <button
                    type="button"
                    className={`catalog-more-btn${p.advancedOpen || p.advancedActive ? " on" : ""}`}
                    aria-expanded={p.advancedOpen}
                    aria-controls="advanced-model-filters"
                    onClick={p.onAdvancedToggle}
                >
                    <span>Filtreler</span>
                    {p.activeFilters.length > 0 && <b>{p.activeFilters.length}</b>}
                    <i aria-hidden="true">{p.advancedOpen ? "→" : "⇥"}</i>
                </button>
                {p.advancedActive && (
                    <button type="button" className="reset-filters" onClick={p.onResetFilters}>Temizle</button>
                )}
            </div>

            <div className="lb-filter-bar catalog-openness-bar">
                <div className="lb-filter-group" role="group" aria-label="Model açıklığı">
                    <span>Açıklık</span>
                    <div className="lb-filter-pills">
                        {([
                            ["open_source", "Open Source"],
                            ["open_weight", "Open Weight"],
                            ["proprietary", "Closed Source"],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                className={p.openness.includes(value) ? "active" : ""}
                                onClick={() => p.onToggleOpenness(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {p.advancedOpen && (
                <div
                    className="catalog-filter-layer"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) p.onAdvancedToggle();
                    }}
                >
                    <aside
                        className="catalog-filter-drawer"
                        id="advanced-model-filters"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="catalog-filter-title"
                    >
                        <header className="catalog-filter-drawer-head">
                            <div>
                                <p className="kicker">MODEL KATALOĞU</p>
                                <h3 id="catalog-filter-title">Filtreler</h3>
                                <span>Sonuçları ihtiyacına göre daralt.</span>
                            </div>
                            <button type="button" onClick={p.onAdvancedToggle} aria-label="Filtreleri kapat">×</button>
                        </header>

                        <div className="catalog-filter-drawer-body">
                            <p className="catalog-filter-note">Aynı alandaki seçimler <strong>VEYA</strong>, farklı alanlar <strong>VE</strong> mantığıyla çalışır.</p>

                            <section className="catalog-filter-section">
                                <h4>Model özellikleri</h4>
                                <div className="catalog-filter-grid">
                                    <MultiSelectFilter className="catalog-filter-wide" title="Model ailesi" values={p.families} options={p.facets.families.map(i => ({ value: i.name, count: i.count }))} onToggle={p.onToggleFamily} />
                                    <label><span>Min. context</span><select value={p.minContext} onChange={e => p.onMinContextChange(e.target.value)}><option value="">Farketmez</option><option value="32768">32K+</option><option value="131072">128K+</option><option value="1000000">1M+</option></select></label>
                                    <label><span>Maks. girdi</span><input type="number" min="0" step="0.01" value={p.maxInputPrice} onChange={e => p.onMaxInputPriceChange(e.target.value)} placeholder="USD / 1M" /></label>
                                    <label><span>Maks. çıktı</span><input type="number" min="0" step="0.01" value={p.maxOutputPrice} onChange={e => p.onMaxOutputPriceChange(e.target.value)} placeholder="USD / 1M" /></label>
                                </div>
                            </section>

                            <section className="catalog-filter-section">
                                <h4>Erişim ve lisans</h4>
                                <div className="catalog-filter-grid">
                                    <MultiSelectFilter className="catalog-filter-wide" title="API sağlayıcısı" values={p.providers} options={p.facets.providers.map(i => ({ value: i.slug, count: i.count }))} onToggle={p.onToggleProvider} onClear={p.onClearProviders} renderLabel={v => p.facets.providers.find(i => i.slug === v)?.name ?? v} />
                                    <MultiSelectFilter title="Lisans" values={p.licenses} options={licenseOptions} renderLabel={v => ({ mit: "MIT", apache_2_0: "Apache 2.0", llama_community: "Llama Community", model_specific: "Modele özel", other: "Diğer", unknown: "Bilinmiyor" }[v] ?? v)} onToggle={p.onToggleLicense} />
                                    <MultiSelectFilter title="Ticari kullanım" values={p.commercialStatuses} options={[{ value: "allowed" }, { value: "restricted" }, { value: "unknown" }]} renderLabel={v => ({ allowed: "İzinli", restricted: "Kısıtlı", unknown: "Bilinmiyor" }[v] ?? v)} onToggle={p.onToggleCommercial} />
                                </div>
                            </section>

                            <section className="catalog-filter-section">
                                <h4>Yetenek ve performans</h4>
                                <div className="catalog-filter-grid">
                                    <MultiSelectFilter title="Modalite" values={p.modalities} options={modalityOptions} renderLabel={p.trModality} onToggle={p.onToggleModality} />
                                    <MultiSelectFilter title="Yetenek" values={p.capabilities} options={capOptions} renderLabel={p.trCapability} onToggle={p.onToggleCapability} />
                                    <MultiSelectFilter title="Gelişmişlik" values={p.advancedness} options={[...ADVANCEDNESS_OPTIONS]} renderLabel={v => ADVANCEDNESS_LABELS[v] ?? v} onToggle={p.onToggleAdvancedness} />
                                    <label><span>Benchmark odağı</span><select value={p.benchmarkFocus} onChange={e => p.onBenchmarkFocusChange(e.target.value)}><option value="any">Farketmez (tüm modeller)</option><option value="general">Genel (yalnızca benchmarklı modeller)</option><option value="coding">Coding (yalnızca benchmarklı modeller)</option><option value="reasoning">Reasoning (yalnızca benchmarklı modeller)</option><option value="agent">Agent (yalnızca benchmarklı modeller)</option><option value="multimodal">Multimodal (yalnızca benchmarklı modeller)</option></select></label>
                                </div>
                            </section>
                        </div>

                        <footer className="catalog-filter-drawer-actions">
                            <button type="button" className="catalog-filter-drawer-reset" onClick={p.onResetFilters}>Tümünü temizle</button>
                            <button type="button" className="catalog-filter-drawer-apply" onClick={p.onAdvancedToggle}>
                                {p.profileLoading ? "Sonuçlar hazırlanıyor…" : `${p.resultTotal.toLocaleString("tr-TR")} modeli göster`}
                            </button>
                        </footer>
                    </aside>
                </div>
            )}

            {p.activeFilters.length > 0 && (
                <div className="catalog-chips">
                    {p.activeFilters.map(chip => (
                        <button key={chip.key} type="button" className="filter-chip" onClick={chip.clear}>{chip.label} ×</button>
                    ))}
                </div>
            )}

            <div className="catalog-table-wrap">
                <div className="catalog-scroll">
                    <table className="catalog-table">
                        <thead>
                            <tr>
                                <th />
                                <ColumnFilterHead label="Model" field="name" sortStack={p.sortStack} onSort={p.onSort} />
                                <ColumnFilterHead
                                    label="Geliştirici"
                                    field="provider"
                                    sortStack={p.sortStack}
                                    onSort={p.onSort}
                                    filterActive={p.developers.length > 0}
                                    filterCount={p.developers.length || undefined}
                                >
                                    <ColumnCheckboxList
                                        values={p.developers}
                                        options={p.companies.map(c => ({ value: c.slug, count: c.count }))}
                                        onToggle={p.onToggleDeveloper}
                                        onClear={p.onClearDevelopers}
                                        renderLabel={v => p.companies.find(c => c.slug === v)?.name ?? v}
                                    />
                                </ColumnFilterHead>
                                <ColumnFilterHead
                                    label="Gelişmişlik"
                                    field="benchmark_score"
                                    sortStack={p.sortStack}
                                    onSort={p.onSort}
                                    filterActive={p.advancedness.length > 0}
                                    filterCount={p.advancedness.length || undefined}
                                >
                                    <ColumnCheckboxList
                                        values={p.advancedness}
                                        options={ADVANCEDNESS_OPTIONS.map(item => ({ value: item.value }))}
                                        onToggle={p.onToggleAdvancedness}
                                        onClear={() => { p.onClearAdvancedness(); }}
                                        renderLabel={v => ADVANCEDNESS_LABELS[v] ?? v}
                                    />
                                </ColumnFilterHead>
                                <ColumnFilterHead
                                    label="Context"
                                    field="context"
                                    sortStack={p.sortStack}
                                    onSort={p.onSort}
                                    filterActive={!!p.minContext}
                                    filterCount={p.minContext ? 1 : undefined}
                                >
                                    <div className="catalog-col-filter-body">
                                        <p className="catalog-col-filter-hint">Minimum context penceresi</p>
                                        <div className="catalog-col-filter-options">
                                            {[
                                                { value: "", label: "Farketmez" },
                                                { value: "32768", label: "32K+" },
                                                { value: "131072", label: "128K+" },
                                                { value: "1000000", label: "1M+" },
                                            ].map(item => (
                                                <label key={item.label} className={`catalog-filter-option${p.minContext === item.value ? " active" : ""}`}>
                                                    <input type="radio" name="ctx-filter" checked={p.minContext === item.value} onChange={() => p.onMinContextChange(item.value)} />
                                                    <span>{item.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </ColumnFilterHead>
                                <ColumnFilterHead
                                    label="Girdi"
                                    field="input_price"
                                    sortStack={p.sortStack}
                                    onSort={p.onSort}
                                    filterActive={!!p.maxInputPrice}
                                    filterCount={p.maxInputPrice ? 1 : undefined}
                                >
                                    <div className="catalog-col-filter-body">
                                        <label className="catalog-col-number">
                                            <span>Maks. girdi fiyatı (USD / 1M)</span>
                                            <input type="number" min="0" step="0.01" value={p.maxInputPrice} onChange={e => p.onMaxInputPriceChange(e.target.value)} placeholder="ör. 3.00" />
                                        </label>
                                        {p.maxInputPrice && <button type="button" className="catalog-filter-clear-row" onClick={() => p.onMaxInputPriceChange("")}>Temizle</button>}
                                    </div>
                                </ColumnFilterHead>
                                <ColumnFilterHead
                                    label="Çıktı"
                                    field="output_price"
                                    sortStack={p.sortStack}
                                    onSort={p.onSort}
                                    filterActive={!!p.maxOutputPrice}
                                    filterCount={p.maxOutputPrice ? 1 : undefined}
                                >
                                    <div className="catalog-col-filter-body">
                                        <label className="catalog-col-number">
                                            <span>Maks. çıktı fiyatı (USD / 1M)</span>
                                            <input type="number" min="0" step="0.01" value={p.maxOutputPrice} onChange={e => p.onMaxOutputPriceChange(e.target.value)} placeholder="ör. 15.00" />
                                        </label>
                                        {p.maxOutputPrice && <button type="button" className="catalog-filter-clear-row" onClick={() => p.onMaxOutputPriceChange("")}>Temizle</button>}
                                    </div>
                                </ColumnFilterHead>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {p.models.length === 0 && !p.profileLoading && (
                                <tr>
                                    <td colSpan={8} className="catalog-empty">Filtrelere uygun model bulunamadı. Filtreleri gevşetmeyi deneyin.</td>
                                </tr>
                            )}
                            {p.models.map(model => {
                                const site = model.company.website_url ?? p.developerSites[model.company.slug];
                                const selected = p.selectedIds.includes(model.id);
                                return (
                                    <tr key={model.id}>
                                        <td>
                                            <button type="button" className={`catalog-pick${selected ? " on" : ""}`} onClick={() => p.onToggleSelect(model)} aria-label="Karşılaştır">{selected ? "✓" : "+"}</button>
                                        </td>
                                        <td>
                                            <button type="button" className="catalog-model" onClick={() => p.onInspect(model)}>
                                                <ModelAvatar name={model.name} companySlug={model.company.slug} companyName={model.company.name} websiteUrl={site} size="md" />
                                                <span><strong>{model.name}</strong><small>{model.slug}</small></span>
                                            </button>
                                        </td>
                                        <td><span className="company-chip">{model.company.name}</span></td>
                                        <td>{advancednessBadge(model)}</td>
                                        <td className="mono">{model.context_window?.toLocaleString("tr-TR") ?? "—"}</td>
                                        <td className="price">{p.money(model.pricing?.input)}</td>
                                        <td className="price">{p.money(model.pricing?.output)}</td>
                                        <td><button type="button" className="catalog-link" onClick={() => p.onInspect(model)}>İncele</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {p.hasMore && <div ref={sentinelRef} className="catalog-scroll-sentinel" aria-hidden="true" />}
                </div>
                {!p.hasMore && (
                <div className="catalog-foot" aria-live="polite">
                    <span className="catalog-page-meta">
                        {p.models.length.toLocaleString("tr-TR")} / {p.resultTotal.toLocaleString("tr-TR")} model
                    </span>
                </div>
                )}
            </div>
        </section>
    );
}
