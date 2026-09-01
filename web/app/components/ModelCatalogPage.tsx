"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ModelAvatar from "./ModelAvatar";

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
    capabilities: { name: string; count: number }[];
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
    onSort: (field: CatalogSortBy) => void;
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
    page: number;
    pages: number;
    onPageChange: (value: number | ((current: number) => number)) => void;
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

function MultiSelectFilter({ title, values, options, onToggle, onClear, renderLabel = v => v }: {
    title: string; values: string[]; options: { value: string; count?: number }[];
    onToggle: (value: string) => void; onClear?: () => void; renderLabel?: (value: string) => string;
}) {
    const summary = values.length === 0 ? "Farketmez" : values.length <= 2 ? values.map(renderLabel).join(", ") : `${values.length} seçili`;
    return (
        <fieldset className="multi-filter">
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

function ColumnFilterHead({ label, field, sortStack, onSort, filterActive, filterCount, children }: {
    label: string;
    field: CatalogSortBy;
    sortStack: CatalogSortSpec[];
    onSort: (field: CatalogSortBy) => void;
    filterActive?: boolean;
    filterCount?: number;
    children?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLTableCellElement>(null);
    const mark = columnSortMark(sortStack, field);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", close);
        window.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
    }, [open]);

    return (
        <th ref={rootRef} className={`catalog-col-head${open ? " open" : ""}`}>
            <div className="catalog-col-head-inner">
                <button
                    type="button"
                    className={`sort-header${mark ? " active" : ""}`}
                    onClick={() => onSort(field)}
                >
                    {label}{mark && <span className="sort-mark">{mark}</span>}
                </button>
                {children && (
                    <button
                        type="button"
                        className={`catalog-col-filter-btn${filterActive ? " on" : ""}`}
                        aria-expanded={open}
                        aria-label={`${label} filtrele`}
                        onClick={() => setOpen(v => !v)}
                    >
                        {filterCount ? filterCount : "⛭"}
                    </button>
                )}
            </div>
            {open && children && (
                <div className="catalog-col-filter-menu" onClick={e => e.stopPropagation()}>
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
    const capOptions = useMemo(() => Array.from(new Map([
        ...p.runtimeCapabilityOptions.map(v => [v, 0] as [string, number]),
        ["reasoning", 0], ["coding", 0], ["tool_calling", 0],
        ...p.facets.capabilities.map(i => [i.name, i.count] as [string, number]),
    ]).entries()).map(([value, count]) => ({ value, count })), [p.facets.capabilities, p.runtimeCapabilityOptions]);
    const sortSummary = p.sortStack.map(item => `${p.sortLabels[item.field]} ${item.order === "asc" ? "↑" : "↓"}`).join(" · ");

    return (
        <section className="catalog-page" id="models">
            <header className="catalog-top">
                <div>
                    <p className="kicker">MODEL KATALOĞU</p>
                    <h2>{p.loading ? "Yükleniyor…" : `${p.modelCount.toLocaleString("tr-TR")} model`}</h2>
                </div>
                <p className="catalog-meta">{p.profileLoading ? "…" : `${p.resultTotal.toLocaleString("tr-TR")} sonuç`} · {sortSummary}</p>
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
                <button type="button" className={`catalog-more-btn${p.advancedOpen || p.advancedActive ? " on" : ""}`} onClick={p.onAdvancedToggle}>
                    Filtreler {p.advancedOpen ? "−" : "+"}
                </button>
            </div>

            {p.advancedOpen && (
                <div className="catalog-advanced advanced-filters" id="advanced-model-filters">
                    <p className="catalog-filter-note">Aynı kolonda birden fazla seçim <strong>VEYA</strong>, farklı kolonlar arasında <strong>VE</strong> ile birleşir.</p>
                    <MultiSelectFilter title="Açıklık" values={p.openness} options={[
                        { value: "open_source" }, { value: "open_weight" }, { value: "proprietary" },
                    ]} renderLabel={v => ({ open_source: "Açık kaynak", open_weight: "Açık ağırlık", proprietary: "Kapalı kaynak" }[v] ?? v)} onToggle={p.onToggleOpenness} />
                    <MultiSelectFilter title="Model ailesi" values={p.families} options={p.facets.families.map(i => ({ value: i.name, count: i.count }))} onToggle={p.onToggleFamily} />
                    <label><span>Min. context</span><select value={p.minContext} onChange={e => p.onMinContextChange(e.target.value)}><option value="">Farketmez</option><option value="32768">32K+</option><option value="131072">128K+</option><option value="1000000">1M+</option></select></label>
                    <label><span>Maks. girdi</span><input type="number" min="0" step="0.01" value={p.maxInputPrice} onChange={e => p.onMaxInputPriceChange(e.target.value)} placeholder="USD / 1M" /></label>
                    <label><span>Maks. çıktı</span><input type="number" min="0" step="0.01" value={p.maxOutputPrice} onChange={e => p.onMaxOutputPriceChange(e.target.value)} placeholder="USD / 1M" /></label>
                    <MultiSelectFilter title="Sağlayıcı" values={p.providers} options={p.facets.providers.map(i => ({ value: i.slug, count: i.count }))} onToggle={p.onToggleProvider} onClear={p.onClearProviders} renderLabel={v => p.facets.providers.find(i => i.slug === v)?.name ?? v} />
                    <MultiSelectFilter title="Lisans" values={p.licenses} options={[{ value: "mit" }, { value: "apache_2_0" }, { value: "other" }]} renderLabel={v => ({ mit: "MIT", apache_2_0: "Apache 2.0", other: "Diğer" }[v] ?? v)} onToggle={p.onToggleLicense} />
                    <MultiSelectFilter title="Ticari kullanım" values={p.commercialStatuses} options={[{ value: "allowed" }, { value: "restricted" }, { value: "unknown" }]} renderLabel={v => ({ allowed: "İzinli", restricted: "Kısıtlı", unknown: "Bilinmiyor" }[v] ?? v)} onToggle={p.onToggleCommercial} />
                    <MultiSelectFilter title="Modalite" values={p.modalities} options={[{ value: "text" }, { value: "image" }, { value: "audio" }, { value: "video" }]} renderLabel={p.trModality} onToggle={p.onToggleModality} />
                    <MultiSelectFilter title="Yetenek" values={p.capabilities} options={capOptions} renderLabel={p.trCapability} onToggle={p.onToggleCapability} />
                    <MultiSelectFilter title="Gelişmişlik" values={p.advancedness} options={[...ADVANCEDNESS_OPTIONS]} renderLabel={v => ADVANCEDNESS_LABELS[v] ?? v} onToggle={p.onToggleAdvancedness} />
                    <label><span>Benchmark odağı</span><select value={p.benchmarkFocus} onChange={e => p.onBenchmarkFocusChange(e.target.value)}><option value="any">Genel (varsayılan)</option><option value="general">Genel</option><option value="coding">Coding</option><option value="reasoning">Reasoning</option><option value="agent">Agent</option><option value="multimodal">Multimodal</option></select></label>
                    <button type="button" className="reset-filters" onClick={p.onResetFilters}>Sıfırla</button>
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
                </div>
                <div className="catalog-foot" role="navigation" aria-label="Sayfalama">
                    <button type="button" className="catalog-page-btn" disabled={p.page === 1} onClick={() => p.onPageChange(n => n - 1)}>← Önceki</button>
                    <span className="catalog-page-meta">{p.page} / {p.pages}</span>
                    <button type="button" className="catalog-page-btn" disabled={p.page === p.pages} onClick={() => p.onPageChange(n => n + 1)}>Sonraki →</button>
                </div>
            </div>
        </section>
    );
}
