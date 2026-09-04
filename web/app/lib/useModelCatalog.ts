import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { ADVANCEDNESS_LABELS, DEFAULT_SORT_STACK, type CatalogSortSpec } from "../components/ModelCatalogPage";
import { useLanguage } from "./i18n";
import { trackEvent } from "./analytics";
import type { Facets, ModelItem, SearchModelItem, SortBy } from "./catalogTypes";
import { BENCHMARK_FOCUS_LABELS, OPENNESS_LABELS, SORT_LABELS, trCapability, trModality } from "./homeContent";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const PAGE_SIZE = 20;

function mapSearchModels(items: SearchModelItem[]): ModelItem[] {
    return items.map(item => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        family: item.family,
        release_date: item.release_date,
        parameter_count: item.parameter_count,
        active_parameter_count: item.active_parameter_count,
        backend: item.providers[0] ?? null,
        company: item.developer,
        context_window: item.context_window,
        capabilities: { input_modalities: item.modalities },
        pricing: { ...item.pricing, currency: "USD", observed_at: item.observed_at },
        profile: {
            tool_calling: item.tool_calling,
            reasoning: item.reasoning,
            availability: item.availability,
            openness: item.openness,
            license: item.license,
            commercial_use_status: item.commercial_use_status,
        },
        selection: item.selection,
    }));
}

const isDefaultSort = (stack: CatalogSortSpec[]) => stack.length === 1 && stack[0].field === "name" && stack[0].order === "asc";

/**
 * The model catalog's search box, sort stack, and every advanced filter -
 * one coupled state machine, since they all feed the same debounced
 * `/models/search` request. `models` is the (always-empty, in this app)
 * local model list ModelCatalogPage falls back to when facets/search haven't
 * loaded yet - carried through unchanged from the pre-split code rather than
 * assumed dead, since callers outside `enabled` still read it.
 */
export function useModelCatalog({ enabled, models, setError }: { enabled: boolean; models: ModelItem[]; setError: Dispatch<SetStateAction<boolean>> }) {
    const { language, locale } = useLanguage();
    const opennessLabels = OPENNESS_LABELS[language];
    const benchmarkFocusLabels = BENCHMARK_FOCUS_LABELS[language];
    const sortLabels = SORT_LABELS[language];
    const trModalityLabel = (tag: string) => trModality(tag, language);
    const trCapabilityLabel = (value: string) => trCapability(value, language);

    const [query, setQuery] = useState("");
    const [developers, setDevelopers] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [profileResults, setProfileResults] = useState<ModelItem[] | null>(null);
    const [profileTotal, setProfileTotal] = useState(0);
    const [profileLoading, setProfileLoading] = useState(false);
    const skipInitialCatalogFetchRef = useRef(true);
    const catalogRequestIdRef = useRef(0);
    const [minContext, setMinContext] = useState("");
    const [maxInputPrice, setMaxInputPrice] = useState("");
    const [maxOutputPrice, setMaxOutputPrice] = useState("");
    const [openness, setOpenness] = useState<string[]>([]);
    const [licenses, setLicenses] = useState<string[]>([]);
    const [commercialStatuses, setCommercialStatuses] = useState<string[]>([]);
    const [modalities, setModalities] = useState<string[]>([]);
    const [capabilities, setCapabilities] = useState<string[]>([]);
    const [providers, setProviders] = useState<string[]>([]);
    const [families, setFamilies] = useState<string[]>([]);
    const [advancedness, setAdvancedness] = useState<string[]>([]);
    const [sortStack, setSortStack] = useState<CatalogSortSpec[]>(DEFAULT_SORT_STACK);
    const [benchmarkFocus, setBenchmarkFocus] = useState("any");
    const [facets, setFacets] = useState<Facets>({ developers: [], providers: [], families: [], modalities: [], capabilities: [], licenses: [], openness: [], commercial_use: [], benchmark_focuses: [] });

    // Boot: show catalog models immediately, independent of the debounced
    // filter effect below (which would otherwise wait for its own trigger).
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const requestId = ++catalogRequestIdRef.current;
        const bootParams = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: "0",
            sort_by: "name",
            sort_order: "asc",
        });

        fetch(`${API}/api/v1/models/search?${bootParams}`, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (requestId === catalogRequestIdRef.current && data?.items) {
                    setProfileResults(mapSearchModels(data.items as SearchModelItem[]));
                    setProfileTotal(Number(data.total ?? 0));
                }
            })
            .catch(() => { /* keep empty catalog */ });

        fetch(`${API}/api/v1/models/facets`, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setFacets(data); })
            .catch(() => { /* optional */ });

        return () => controller.abort();
    }, []);

    const filterActive = minContext !== "" || maxInputPrice !== "" || maxOutputPrice !== "" || openness.length > 0 || licenses.length > 0 || commercialStatuses.length > 0 || modalities.length > 0 || capabilities.length > 0 || developers.length > 0 || providers.length > 0 || families.length > 0 || advancedness.length > 0 || benchmarkFocus !== "any";
    const advancedActive = filterActive || !isDefaultSort(sortStack);

    useEffect(() => {
        if (!enabled)
            return;
        if (page === 1 && !query.trim() && !filterActive && skipInitialCatalogFetchRef.current && profileResults !== null && profileResults.length > 0) {
            skipInitialCatalogFetchRef.current = false;
            return;
        }
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
        sortStack.forEach(spec => {
            params.append("sort_by", spec.field);
            params.append("sort_order", spec.order);
        });
        if (query.trim())
            params.set("search", query.trim());
        if (developers.length)
            developers.forEach(item => params.append("developer", item));
        if (providers.length)
            providers.forEach(item => params.append("provider", item));
        families.forEach(item => params.append("family", item));
        if (minContext)
            params.set("min_context", minContext);
        if (maxInputPrice)
            params.set("max_input_price", maxInputPrice);
        if (maxOutputPrice)
            params.set("max_output_price", maxOutputPrice);
        openness.forEach(item => params.append("openness", item));
        licenses.forEach(item => params.append("license", item));
        commercialStatuses.forEach(item => params.append("commercial_use_status", item));
        if (benchmarkFocus !== "any")
            params.set("benchmark_focus", benchmarkFocus);
        advancedness.forEach(item => params.append("advancedness", item));
        modalities.forEach(item => params.append("modality", item));
        capabilities.forEach(item => params.append("capability", item));
        const controller = new AbortController();
        const requestId = ++catalogRequestIdRef.current;
        const debounceMs = query.trim() ? 250 : 0;
        const timer = window.setTimeout(() => {
            setProfileLoading(true);
            fetch(`${API}/api/v1/models/search?${params}`, { signal: controller.signal })
                .then(response => {
                    if (!response.ok)
                        throw new Error(language === "tr" ? "Filtre sonuçları alınamadı" : "Failed to load filter results");
                    return response.json();
                })
                .then(data => {
                    if (requestId !== catalogRequestIdRef.current)
                        return;
                    setProfileTotal(data.total);
                    const mapped = mapSearchModels(data.items as SearchModelItem[]);
                    setProfileResults(current => {
                        if (page === 1)
                            return mapped;
                        const seen = new Set((current ?? []).map(item => item.id));
                        return [...(current ?? []), ...mapped.filter(item => !seen.has(item.id))];
                    });
                })
                .catch(error => { if (requestId === catalogRequestIdRef.current && error.name !== "AbortError")
                    setError(true); })
                .finally(() => {
                    if (requestId === catalogRequestIdRef.current)
                        setProfileLoading(false);
                });
        }, debounceMs);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [enabled, page, query, developers, providers, families, minContext, maxInputPrice, maxOutputPrice, openness, licenses, commercialStatuses, modalities, capabilities, advancedness, benchmarkFocus, sortStack, filterActive, language, setError]);

    const companies = useMemo(() => facets.developers.length ? facets.developers : Array.from(new Map(models.map(m => [m.company.slug, m.company])).values()).sort((a, b) => a.name.localeCompare(b.name)), [models, facets.developers]);
    const developerSites = useMemo<Record<string, string | null>>(() => Object.fromEntries(companies.map(company => [company.slug, "website_url" in company && typeof company.website_url === "string" ? company.website_url : null])), [companies]);

    function resetAdvanced() {
        setQuery("");
        setMinContext("");
        setMaxInputPrice("");
        setMaxOutputPrice("");
        setOpenness([]);
        setLicenses([]);
        setCommercialStatuses([]);
        setModalities([]);
        setCapabilities([]);
        setProviders([]);
        setDevelopers([]);
        setFamilies([]);
        setAdvancedness([]);
        setBenchmarkFocus("any");
        setSortStack(DEFAULT_SORT_STACK);
        setPage(1);
    }
    function toggleAdvancedness(value: string) { setAdvancedness(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setPage(1); }
    function toggleDeveloper(value: string) { setDevelopers(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setPage(1); }
    function toggleProvider(value: string) { setProviders(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setPage(1); }
    function toggleModality(value: string) { setModalities(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setPage(1); }
    function toggleCapability(value: string) { setCapabilities(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setPage(1); }
    function toggleList(value: string, setter: Dispatch<SetStateAction<string[]>>) { setter(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setPage(1); }
    function changeSort(field: SortBy, requestedOrder?: "asc" | "desc") {
        const catalogField = field as CatalogSortSpec["field"];
        setSortStack(current => {
            const index = current.findIndex(item => item.field === catalogField);
            if (index >= 0) {
                if (requestedOrder)
                    return current.map((item, i) => i === index ? { ...item, order: requestedOrder } : item);
                if (current[index].order === "asc")
                    return current.map((item, i) => i === index ? { ...item, order: "desc" as const } : item);
                const next = current.filter((_, i) => i !== index);
                return next.length ? next : DEFAULT_SORT_STACK;
            }
            const order = requestedOrder ?? "asc";
            if (isDefaultSort(current))
                return [{ field: catalogField, order }];
            if (current.length >= 3)
                return [...current.slice(1), { field: catalogField, order }];
            return [...current, { field: catalogField, order }];
        });
        setPage(1);
        trackEvent(API, "sort_changed", { sort: { field } });
    }
    const activeModelFilters = useMemo(() => { const chips: {
        key: string;
        label: string;
        clear: () => void;
    }[] = []; if (query.trim())
        chips.push({ key: "q", label: `"${query.trim()}"`, clear: () => { setQuery(""); setPage(1); } }); developers.forEach(slug => chips.push({ key: `dev-${slug}`, label: companies.find(c => c.slug === slug)?.name ?? slug, clear: () => toggleDeveloper(slug) })); if (!isDefaultSort(sortStack))
        sortStack.forEach((spec, index) => chips.push({ key: `sort-${spec.field}-${index}`, label: `${sortStack.length > 1 ? `${index + 1}. ` : ""}${sortLabels[spec.field]} ${spec.order === "asc" ? "↑" : "↓"}`, clear: () => { setSortStack(current => { const next = current.filter((_, i) => i !== index); return next.length ? next : DEFAULT_SORT_STACK; }); setPage(1); } })); providers.forEach(slug => chips.push({ key: `provider-${slug}`, label: facets.providers.find(p => p.slug === slug)?.name ?? slug, clear: () => toggleProvider(slug) })); if (minContext)
        chips.push({ key: "ctx", label: `${Number(minContext).toLocaleString(locale)}+ ctx`, clear: () => { setMinContext(""); setPage(1); } }); if (maxInputPrice)
        chips.push({ key: "in", label: `${language === "tr" ? "Girdi" : "Input"} ≤ $${maxInputPrice}`, clear: () => { setMaxInputPrice(""); setPage(1); } }); if (maxOutputPrice)
        chips.push({ key: "out", label: `${language === "tr" ? "Çıktı" : "Output"} ≤ $${maxOutputPrice}`, clear: () => { setMaxOutputPrice(""); setPage(1); } }); if (benchmarkFocus !== "any")
        chips.push({ key: "bench", label: `${language === "tr" ? "Odağı" : "Focus"}: ${benchmarkFocusLabels[benchmarkFocus] ?? benchmarkFocus}`, clear: () => { setBenchmarkFocus("any"); setPage(1); } }); advancedness.forEach(item => chips.push({ key: `adv-${item}`, label: ADVANCEDNESS_LABELS[language][item] ?? item, clear: () => toggleAdvancedness(item) })); families.forEach(item => chips.push({ key: `family-${item}`, label: item, clear: () => toggleList(item, setFamilies) })); openness.forEach(item => chips.push({ key: `open-${item}`, label: opennessLabels[item] ?? item, clear: () => toggleList(item, setOpenness) })); licenses.forEach(item => chips.push({ key: `license-${item}`, label: item.replaceAll("_", " "), clear: () => toggleList(item, setLicenses) })); commercialStatuses.forEach(item => chips.push({ key: `commercial-${item}`, label: `${language === "tr" ? "Ticari" : "Commercial"}: ${item.replaceAll("_", " ")}`, clear: () => toggleList(item, setCommercialStatuses) })); modalities.forEach(item => chips.push({ key: `mod-${item}`, label: trModalityLabel(item), clear: () => toggleModality(item) })); capabilities.forEach(item => chips.push({ key: `cap-${item}`, label: trCapabilityLabel(item), clear: () => toggleCapability(item) })); return chips; }, [query, developers, sortStack, providers, minContext, maxInputPrice, maxOutputPrice, benchmarkFocus, advancedness, families, openness, licenses, commercialStatuses, modalities, capabilities, companies, facets.providers, language, locale, benchmarkFocusLabels, opennessLabels, sortLabels, trModalityLabel, trCapabilityLabel]);

    useEffect(() => {
        if (!enabled || query.trim().length < 2)
            return;
        const timer = window.setTimeout(() => trackEvent(API, "search_performed", { filters: { query: query.trim() } }), 700);
        return () => window.clearTimeout(timer);
    }, [enabled, query]);
    useEffect(() => {
        if (!enabled || !filterActive)
            return;
        const timer = window.setTimeout(() => trackEvent(API, "filter_applied", { filters: { developers, providers, families, min_context: minContext || null, max_input_price: maxInputPrice || null, max_output_price: maxOutputPrice || null, openness, licenses, commercial_use: commercialStatuses, modalities, capabilities, advancedness, benchmark_focus: benchmarkFocus } }), 700);
        return () => window.clearTimeout(timer);
    }, [enabled, filterActive, developers, providers, families, minContext, maxInputPrice, maxOutputPrice, openness, licenses, commercialStatuses, modalities, capabilities, advancedness, benchmarkFocus]);

    return {
        query, setQuery,
        developers, setDevelopers,
        page, setPage,
        advancedOpen, setAdvancedOpen,
        profileResults, profileTotal, profileLoading,
        minContext, setMinContext,
        maxInputPrice, setMaxInputPrice,
        maxOutputPrice, setMaxOutputPrice,
        openness, setOpenness, licenses, setLicenses, commercialStatuses, setCommercialStatuses,
        modalities, setModalities, capabilities, setCapabilities,
        providers, setProviders, families, setFamilies, advancedness, setAdvancedness,
        sortStack, benchmarkFocus, setBenchmarkFocus,
        facets,
        filterActive, advancedActive,
        companies, developerSites,
        resetAdvanced,
        toggleAdvancedness, toggleDeveloper, toggleProvider, toggleModality, toggleCapability, toggleList,
        changeSort,
        sortLabels, opennessLabels, benchmarkFocusLabels, trModalityLabel, trCapabilityLabel,
        activeModelFilters,
    };
}
