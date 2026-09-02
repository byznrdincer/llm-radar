"use client";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import ProductInsights from "./components/ProductInsights";
import type { InsightsView } from "./components/ProductInsights";
import LeaderboardPage, { LIVEBENCH_VIEW_CATEGORY, type Leaderboard, type LeaderboardItem, type LeaderboardView } from "./components/LeaderboardPage";
import ModelCatalogPage, { ADVANCEDNESS_LABELS, DEFAULT_SORT_STACK, type CatalogSortSpec } from "./components/ModelCatalogPage";
import SmartModelComparison from "./components/SmartModelComparison";
import FeedbackPage from "./components/FeedbackPage";
import EventsPage from "./components/EventsPage";
import ResearchPage, { type ResearchBootstrap } from "./components/ResearchPage";
import TechnologyRadarPage from "./components/TechnologyRadarPage";
import SourcesPage from "./components/SourcesPage";
import type { TurkishModel } from "./components/TurkishLLMPage";
import { trackEvent } from "./lib/analytics";
import { toPublicSourceUrl } from "./lib/publicSourceUrl";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const PAGE_SIZE = 20;
const INITIAL_RESEARCH_LIMIT = 17;
const LEADERBOARD_LIMIT = 40;

type BoardKey = "general" | "coding" | "swe-live" | "tau-bench" | "intelligence" | "aa-coding" | "agentic" | "livebench" | "mmlu-pro" | "livecodebench";

function boardKeyForView(view: LeaderboardView): BoardKey {
    if (view === "general") return "general";
    if (view === "coding") return "coding";
    if (view === "swe-live") return "swe-live";
    if (view === "tau-bench") return "tau-bench";
    if (view === "intelligence") return "intelligence";
    if (view === "aa-coding") return "aa-coding";
    if (view === "agentic") return "agentic";
    if (view === "mmlu-pro") return "mmlu-pro";
    if (view === "livecodebench") return "livecodebench";
    return "livebench";
}

function leaderboardUrl(
    boardKey: BoardKey,
    livebenchCategory: string,
    mmluCategory: string,
    sweLiveCategory: string,
    tauCategory: string,
): string {
    switch (boardKey) {
        case "general":
            return `${API}/api/v1/leaderboards/arena?limit=${LEADERBOARD_LIMIT}`;
        case "coding":
            return `${API}/api/v1/leaderboards/swe-bench?limit=${LEADERBOARD_LIMIT}`;
        case "swe-live":
            return `${API}/api/v1/leaderboards/swe-bench-live?category=${sweLiveCategory}&limit=${LEADERBOARD_LIMIT}`;
        case "tau-bench":
            return `${API}/api/v1/leaderboards/tau-bench?category=${tauCategory}&limit=${LEADERBOARD_LIMIT}`;
        case "intelligence":
            return `${API}/api/v1/leaderboards/artificial-analysis/intelligence?limit=${LEADERBOARD_LIMIT}`;
        case "aa-coding":
            return `${API}/api/v1/leaderboards/artificial-analysis/coding?limit=${LEADERBOARD_LIMIT}`;
        case "agentic":
            return `${API}/api/v1/leaderboards/artificial-analysis/agentic?limit=${LEADERBOARD_LIMIT}`;
        case "mmlu-pro":
            return `${API}/api/v1/leaderboards/mmlu-pro?category=${mmluCategory}&limit=${LEADERBOARD_LIMIT}`;
        case "livecodebench":
            return `${API}/api/v1/leaderboards/livecodebench?limit=${LEADERBOARD_LIMIT}`;
        default:
            return `${API}/api/v1/leaderboards/livebench?category=${livebenchCategory}&limit=${LEADERBOARD_LIMIT}`;
    }
}

function cachedLeaderboard(
    boardKey: BoardKey,
    boards: {
        arena: Leaderboard | null;
        swebench: Leaderboard | null;
        swebenchLive: Leaderboard | null;
        tauBench: Leaderboard | null;
        aaIntelligence: Leaderboard | null;
        aaCoding: Leaderboard | null;
        aaAgentic: Leaderboard | null;
        livebench: Leaderboard | null;
        mmluPro: Leaderboard | null;
        livecodebench: Leaderboard | null;
    },
    categories: {
        livebenchCategory: string;
        mmluCategory: string;
        sweLiveCategory: string;
        tauCategory: string;
    },
): Leaderboard | null {
    let board: Leaderboard | null = null;
    if (boardKey === "general") board = boards.arena;
    else if (boardKey === "coding") board = boards.swebench;
    else if (boardKey === "swe-live") board = boards.swebenchLive;
    else if (boardKey === "tau-bench") board = boards.tauBench;
    else if (boardKey === "intelligence") board = boards.aaIntelligence;
    else if (boardKey === "aa-coding") board = boards.aaCoding;
    else if (boardKey === "agentic") board = boards.aaAgentic;
    else if (boardKey === "mmlu-pro") board = boards.mmluPro;
    else if (boardKey === "livecodebench") board = boards.livecodebench;
    else board = boards.livebench;

    if (!board?.items?.length) return null;
    if (boardKey === "livebench" && board.category !== categories.livebenchCategory) return null;
    if (boardKey === "mmlu-pro" && board.category !== categories.mmluCategory) return null;
    if (boardKey === "swe-live" && board.category !== categories.sweLiveCategory) return null;
    if (boardKey === "tau-bench" && board.category !== categories.tauCategory) return null;
    return board;
}

function applyLeaderboardData(
    boardKey: BoardKey,
    data: Leaderboard,
    setters: {
        setArena: Dispatch<SetStateAction<Leaderboard | null>>;
        setSwebench: Dispatch<SetStateAction<Leaderboard | null>>;
        setSwebenchLive: Dispatch<SetStateAction<Leaderboard | null>>;
        setTauBench: Dispatch<SetStateAction<Leaderboard | null>>;
        setAaIntelligence: Dispatch<SetStateAction<Leaderboard | null>>;
        setAaCoding: Dispatch<SetStateAction<Leaderboard | null>>;
        setAaAgentic: Dispatch<SetStateAction<Leaderboard | null>>;
        setLivebench: Dispatch<SetStateAction<Leaderboard | null>>;
        setMmluPro: Dispatch<SetStateAction<Leaderboard | null>>;
        setLivecodebench: Dispatch<SetStateAction<Leaderboard | null>>;
    },
) {
    if (boardKey === "general") setters.setArena(data);
    else if (boardKey === "coding") setters.setSwebench(data);
    else if (boardKey === "swe-live") setters.setSwebenchLive(data);
    else if (boardKey === "tau-bench") setters.setTauBench(data);
    else if (boardKey === "intelligence") setters.setAaIntelligence(data);
    else if (boardKey === "aa-coding") setters.setAaCoding(data);
    else if (boardKey === "agentic") setters.setAaAgentic(data);
    else if (boardKey === "mmlu-pro") setters.setMmluPro(data);
    else if (boardKey === "livecodebench") setters.setLivecodebench(data);
    else setters.setLivebench(data);
}

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
type Pricing = {
    input: string | null;
    output: string | null;
    cache_read: string | null;
    currency: string;
    observed_at: string;
};
type SelectionEvidence = {
    benchmark_score: number;
    best_rank: number;
    benchmarks: string[];
    evidence_count: number;
    explanation: string;
};
type ModelItem = {
    id: string;
    slug: string;
    name: string;
    family?: string | null;
    release_date?: string | null;
    parameter_count?: number | null;
    active_parameter_count?: number | null;
    backend?: string | null;
    company: {
        slug: string;
        name: string;
    };
    context_window: number | null;
    capabilities: {
        input_modalities?: string[];
        output_modalities?: string[];
    };
    pricing: Pricing | null;
    profile?: {
        tool_calling: boolean | null;
        reasoning: boolean | null;
        availability: string | null;
        openness?: string | null;
        license: string | null;
        commercial_use_status?: string | null;
    };
    selection?: SelectionEvidence | null;
};
type SearchModelItem = {
    id: string;
    slug: string;
    name: string;
    family: string | null;
    release_date: string | null;
    parameter_count: number | null;
    active_parameter_count: number | null;
    developer: {
        slug: string;
        name: string;
    };
    provider: {
        slug: string;
        name: string;
    } | null;
    providers: string[];
    context_window: number | null;
    pricing: {
        input: string | null;
        output: string | null;
        cache_read: string | null;
    };
    modalities: string[];
    tool_calling: boolean | null;
    reasoning: boolean | null;
    availability: string | null;
    openness: string;
    license: string | null;
    license_category: string;
    commercial_use_status: string;
    observed_at: string;
    selection: SelectionEvidence | null;
};
type ComparedModel = {
    id: string;
    selection?: {
        benchmark_score: number;
        best_rank: number;
        benchmarks?: string[];
        evidence_count?: number;
    } | null;
    features: {
        context_window: number | null;
        input_price: string | null;
        output_price: string | null;
        cache_read_price: string | null;
        modalities: string[];
        tool_calling: boolean | null;
        reasoning: boolean | null;
        availability: string | null;
        license: string | null;
    };
};
type BenchmarkScore = {
    benchmark: string;
    benchmark_slug: string;
    rank: number;
    score: number;
    published_at: string;
    source_url: string;
};
type SourceInfo = {
    name: string;
    url: string;
    reliability: string;
    source_class: string | null;
};
type ModelDetail = ModelItem & {
    description: string | null;
    tokenizer: string | null;
    created: number | null;
    sources: SourceInfo[];
    price_history: Pricing[];
    benchmarks: BenchmarkScore[];
};
type Stats = {
    companies: number;
    models: number;
    snapshots: number;
    price_observations: number;
    change_events: number;
};
type EventItem = {
    id: string;
    event_type: string;
    category: string;
    entity_id: string;
    title: string;
    old_value: Record<string, unknown> | null;
    new_value: Record<string, unknown> | null;
    change_percentage: string | null;
    importance: string;
    importance_score: number;
    detected_at: string;
    evidence?: {
        source?: string;
        source_url?: string;
        sources?: { source?: string; source_url?: string }[];
    } | null;
};
type LeaderboardItem = import("./components/LeaderboardPage").LeaderboardItem;
type TechnologyItem = {
    slug: string;
    name: string;
    category: string;
    strength: string;
    last_seen_at: string;
    evidence: Record<string, unknown>;
};
type Facets = {
    developers: {
        slug: string;
        name: string;
        count: number;
        website_url?: string | null;
    }[];
    providers: {
        slug: string;
        name: string;
        count: number;
    }[];
    families: {
        name: string;
        count: number;
    }[];
    capabilities: {
        name: string;
        count: number;
    }[];
    licenses: {
        name: string;
        count: number;
    }[];
    openness: {
        name: string;
        count: number;
    }[];
    commercial_use: {
        name: string;
        count: number;
    }[];
    benchmark_focuses: string[];
};
type SortBy = "name" | "provider" | "context" | "input_price" | "output_price" | "release_date" | "benchmark_score" | "parameter_count" | "active_parameter_count" | "backend" | "updated_at" | "best_match";
type SortOrder = "asc" | "desc";
const emptyStats: Stats = { companies: 0, models: 0, snapshots: 0, price_observations: 0, change_events: 0 };
const capabilityLabels: Record<string, string> = { reasoning: "Reasoning", coding: "Coding", vision: "Vision", multimodal: "Multimodal", tool_calling: "Tool calling", function_calling: "Function calling", computer_use: "Computer use", agents: "Agents", long_context: "Long context", web_search: "Web arama", prompt_caching: "Prompt önbellek", audio_input: "Ses girdisi", local_runnable: "Yerel çalıştırılabilir", ollama_compatible: "Ollama uyumlu", lm_studio_compatible: "LM Studio uyumlu" };
const opennessLabels: Record<string, string> = { open_source: "Açık kaynak", open_weight: "Açık ağırlık", proprietary: "Kapalı kaynak", unknown: "Bilinmiyor" };
const runtimeCapabilityOptions = ["local_runnable", "ollama_compatible", "lm_studio_compatible"];
const sortLabels: Record<SortBy, string> = { name: "Model adı", provider: "Geliştirici", context: "Context", input_price: "Girdi fiyatı", output_price: "Çıktı fiyatı", release_date: "Yayın tarihi", benchmark_score: "Benchmark puanı", parameter_count: "Parametre sayısı", active_parameter_count: "Aktif parametre", backend: "Backend", updated_at: "En güncel", best_match: "Benchmark uyumu" };
function money(value: string | null | undefined) { if (value == null)
    return "—"; return `$${Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`; }
function compact(value: number) { if (value >= 1000000)
    return `${(value / 1000000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`; if (value >= 1000)
    return `${(value / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}K`; return value.toLocaleString("tr-TR"); }
function trModality(tag: string) {
    const map: Record<string, string> = { text: "metin", image: "gorsel", audio: "ses", video: "video" };
    return map[tag.toLowerCase()] ?? tag;
}
function normalizeModelKey(value: string) {
    return value.toLowerCase().trim().replace(/_/g, "-");
}
function findLocalModel(modelName: string, organization: string, catalog: ModelItem[]) {
    const key = normalizeModelKey(modelName);
    const orgKey = organization.toLowerCase().trim();
    const candidates = catalog.filter(model => {
        const slug = normalizeModelKey(model.slug);
        const name = normalizeModelKey(model.name);
        return slug === key || name === key || slug.includes(key) || key.includes(slug);
    });
    if (!candidates.length)
        return null;
    return candidates.find(model => model.company.name.toLowerCase() === orgKey || model.company.slug === orgKey) ?? candidates[0];
}
function daysAgoIso(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); }
function canOpenSourceUrl(url: string | null | undefined, sourceSlug?: string | null) {
    const publicUrl = toPublicSourceUrl(url, { sourceSlug });
    if (!publicUrl)
        return false;
    const value = publicUrl.toLowerCase();
    if (!value.startsWith("http://") && !value.startsWith("https://"))
        return false;
    if (value.includes("datasets-server.huggingface.co/rows"))
        return false;
    // Block machine JSON/API payloads, but allow human docs under /api/docs/...
    if (/\/api\/v\d+\//.test(value) || value.includes("/api/v1/models"))
        return false;
    if (value.endsWith(".json") || value.endsWith(".jsonl") || value.endsWith(".csv") || value.endsWith(".md"))
        return false;
    return true;
}
function publicHref(url: string | null | undefined, sourceSlug?: string | null) {
    return toPublicSourceUrl(url, { sourceSlug }) ?? url ?? "";
}
const eventMeta: Record<string, {
    label: string;
    icon: string;
    className: string;
}> = {
    "model.released": { label: "Yeni model", icon: "✦", className: "release" },
    "leaderboard.changed": { label: "Benchmark hareketi", icon: "↗", className: "benchmark" },
    "benchmark.updated": { label: "Benchmark güncellendi", icon: "◎", className: "benchmark" },
    "context.changed": { label: "Teknoloji güncellemesi", icon: "↔", className: "technology" },
    "capability.changed": { label: "Yeni yetenek", icon: "+", className: "technology" },
    "github.release_published": { label: "GitHub sürümü", icon: "⌥", className: "technology" },
    "huggingface.updated": { label: "Hugging Face", icon: "◇", className: "technology" },
    "weights.released": { label: "Açık ağırlık", icon: "◇", className: "technology" },
    "license.changed": { label: "Lisans", icon: "§", className: "technology" },
    "company.announcement": { label: "Şirket duyurusu", icon: "!", className: "research" },
    "technology.detected": { label: "Teknoloji sinyali", icon: "⚡", className: "technology" },
    "research.published": { label: "Yeni araştırma", icon: "◌", className: "research" },
    "price.changed": { label: "Fiyat hareketi", icon: "$", className: "price" },
};
function eventInfo(type: string) { return eventMeta[type] ?? { label: type.replaceAll(".", " "), icon: "•", className: "other" }; }
const eventCategories = [["model_release", "Model Release"], ["model_update", "Model Update"], ["ai_agent", "AI Agent"], ["benchmark", "Benchmark"], ["research", "Research"], ["product_launch", "Product Launch"], ["funding", "Funding"], ["acquisition", "Acquisition"], ["partnership", "Partnership"], ["infrastructure", "Infrastructure"], ["regulation", "Regulation"], ["security", "Security"], ["pricing_change", "Pricing Change"], ["api_update", "API Update"]];
const sidebarGroups = [
    { label: "Keşfet", items: [{ id: "overview", label: "Genel bakış", icon: "⌂" }, { id: "leaderboard", label: "Benchmarklar", icon: "▥" }, { id: "models", label: "Model kataloğu", icon: "◫" }, { id: "compare", label: "Karşılaştır", icon: "⇄" }] },
    { label: "Analiz", items: [{ id: "popularity", label: "Popüler modeller", icon: "↗" }, { id: "insights", label: "Pazar grafikleri", icon: "▤" }, { id: "turkish", label: "Türkiye LLM", icon: "TR" }] },
    { label: "İstihbarat", items: [{ id: "events", label: "Gelişmeler", icon: "◉" }, { id: "research", label: "Araştırma", icon: "⌁" }, { id: "radar", label: "Teknoloji radarı", icon: "◎" }, { id: "sources", label: "Kaynaklar", icon: "↗" }] },
    { label: "İletişim", items: [{ id: "feedback", label: "Geri bildirim", icon: "✉" }] },
];
const sectionMeta: Record<string, { group: string; title: string }> = {
    overview: { group: "Keşfet", title: "Genel bakış" },
    leaderboard: { group: "Keşfet", title: "Benchmark sıralamaları" },
    models: { group: "Keşfet", title: "Model kataloğu" },
    compare: { group: "Keşfet", title: "Model karşılaştırma" },
    popularity: { group: "Analiz", title: "Popüler modeller" },
    insights: { group: "Analiz", title: "Pazar grafikleri" },
    turkish: { group: "Analiz", title: "Türkçe odaklı modeller" },
    events: { group: "İstihbarat", title: "Gelişmeler" },
    research: { group: "İstihbarat", title: "Araştırma akışı" },
    radar: { group: "İstihbarat", title: "Teknoloji radarı" },
    sources: { group: "İstihbarat", title: "Kaynak kataloğu" },
    feedback: { group: "İletişim", title: "Geri bildirim" },
};
const insightViews = new Set<InsightsView>(["popularity", "insights", "turkish"]);
const benchmarkInfo: Record<LeaderboardView, {
    name: string;
    summary: string;
    measure: string;
    reading: string;
}> = {
    general: { name: "Chatbot Arena", summary: "İnsanların iki model yanıtını kör biçimde karşılaştırdığı tercih tabanlı değerlendirmedir.", measure: "Arena Rating, oy sayısı ve güven aralığı", reading: "Rating yükseldikçe ve sıra 1'e yaklaştıkça insan tercih performansı daha güçlüdür." },
    coding: { name: "SWE-bench Verified", summary: "Modellerin gerçek GitHub sorunlarını mevcut kod depolarında çözme becerisini ölçer.", measure: "Başarıyla çözülen görev yüzdesi", reading: "Yüksek çözüm oranı daha iyidir; kullanılan agent ve harness sonucu etkileyebilir." },
    "swe-live": { name: "SWE-bench Live", summary: "Yeni ve çok dilli yazılım görevleriyle veri sızıntısı riskini azaltan canlı kodlama değerlendirmesidir.", measure: "Doğrulanan gerçek görevlerde çözüm oranı", reading: "Yüksek oran daha iyidir; tarih ve kullanılan agent birlikte değerlendirilmelidir." },
    "tau-bench": { name: "τ-bench", summary: "Bir modelin gerçekçi iş akışlarında araçları ve API'leri doğru kullanarak görevi tamamlamasını ölçer.", measure: "Pass@1 görev başarı oranı", reading: "İlk denemede daha yüksek başarı, daha güvenilir araç kullanımı anlamına gelir." },
    livecodebench: { name: "LiveCodeBench", summary: "Güncel kod problemleri ve kontaminasyon filtresiyle kod üretme başarısını ölçer.", measure: "Pass@1 kod çözüm oranı", reading: "Daha yüksek puan daha iyidir; güncel tarih penceresi eski ezberlerin etkisini azaltır." },
    intelligence: { name: "Artificial Analysis Intelligence Index", summary: "Farklı bilgi ve akıl yürütme testlerini tek bağımsız endekste birleştirir.", measure: "Bileşik zekâ endeksi", reading: "Yüksek endeks genel problem çözme performansının daha güçlü olduğuna işaret eder." },
    "aa-coding": { name: "Artificial Analysis Coding Index", summary: "Birden fazla kodlama değerlendirmesini ortak bir bağımsız skor altında toplar.", measure: "Bileşik kodlama endeksi", reading: "Yüksek skor kod üretme ve yazılım görevlerinde daha güçlü performansı gösterir." },
    agentic: { name: "Artificial Analysis Agentic Index", summary: "Modelin çok adımlı, araç kullanan ve hedef odaklı görevlerdeki başarısını ölçer.", measure: "Bileşik agentic görev skoru", reading: "Yüksek skor daha tutarlı planlama ve görev tamamlama performansı anlamına gelir." },
    livebench: { name: "LiveBench", summary: "Soruları düzenli yenilenen, kontaminasyonu azaltılmış akademik ve pratik değerlendirme setidir.", measure: "Kategori ve genel başarı skoru", reading: "Yüksek skor daha iyidir; genel skorun yanında alan bazlı sonuçlara da bakılmalıdır." },
    "livebench-math": { name: "LiveBench — Matematik", summary: "LiveBench içindeki matematik alt kategorisinde model başarısını ölçer.", measure: "Doğru cevap yüzdesi", reading: "Yüksek skor matematik akıl yürütmede daha güçlü performans gösterir." },
    "livebench-reasoning": { name: "LiveBench — Reasoning", summary: "LiveBench reasoning alt kategorisinde çok adımlı akıl yürütme becerisini ölçer.", measure: "Doğru cevap yüzdesi", reading: "Yüksek skor karmaşık mantık görevlerinde daha iyi sonuç verir." },
    "livebench-coding": { name: "LiveBench — Kodlama", summary: "LiveBench kodlama alt kategorisinde program üretme ve çözme başarısını ölçer.", measure: "Doğru cevap yüzdesi", reading: "Yüksek skor kod üretiminde daha güçlü performans anlamına gelir." },
    "mmlu-pro": { name: "MMLU-Pro", summary: "14 alanda daha zor seçenekler ve daha fazla akıl yürütme gerektiren akademik bilgi testidir.", measure: "Doğru cevap yüzdesi", reading: "Yüksek doğruluk daha iyidir; alan seçimi modelin uzmanlığını anlamayı kolaylaştırır." },
};
function MultiSelectFilter({ title, values, options, onToggle, renderLabel = value => value }: {
    title: string;
    values: string[];
    options: { value: string; count?: number }[];
    onToggle: (value: string) => void;
    renderLabel?: (value: string) => string;
}) {
    const summary =
        values.length === 0
            ? "Farketmez"
            : values.length <= 2
              ? values.map(renderLabel).join(" + ")
              : `${values.length} seçili`;
    return (
        <fieldset className="multi-filter">
            <legend>{title}</legend>
            <details>
                <summary>{summary}</summary>
                <div className="multi-filter-panel">
                    {values.length > 0 && (
                        <button
                            type="button"
                            className="multi-filter-clear"
                            onClick={() => values.forEach((value) => onToggle(value))}
                        >
                            Seçimi temizle
                        </button>
                    )}
                    <div className="multi-filter-options">
                        {options.map((item) => (
                            <label key={item.value}>
                                <input
                                    type="checkbox"
                                    checked={values.includes(item.value)}
                                    onChange={() => onToggle(item.value)}
                                />
                                <span>
                                    {renderLabel(item.value)}
                                    {item.count ? ` (${item.count})` : ""}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            </details>
        </fieldset>
    );
}
function SortableHeader({ field, label, active, order, onSort }: {
    field: SortBy;
    label: string;
    active: SortBy;
    order: SortOrder;
    onSort: (field: SortBy) => void;
}) {
    const indicator = active === field ? (order === "asc" ? "↑" : "↓") : "↕";
    return <th aria-sort={active === field ? (order === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="sort-header" onClick={() => onSort(field)}>{label} <span>{indicator}</span></button></th>;
}
function cleanEventTitle(event: EventItem) { return event.title.replace(" discovered", " yayınlandı").replace(": context_window changed", " — context penceresi değişti").replace(/: (input|output|cache_read)_per_1m_tokens changed/, " — token fiyatı değişti").replace(": Arena rank changed", " — sıralaması değişti"); }
function eventDetail(event: EventItem) {
    if (event.event_type === "model.released") {
        const value = event.new_value ?? {};
        const context = Number(value.context_window);
        const modalities = [...((value.input_modalities as string[]) ?? []), ...((value.output_modalities as string[]) ?? [])];
        return [context ? `${context.toLocaleString("tr-TR")} token context` : null, modalities.length ? Array.from(new Set(modalities)).join(" + ") : null].filter(Boolean).join(" • ") || "Yeni model kataloğa eklendi";
    }
    if (event.event_type === "price.changed")
        return event.change_percentage ? `Fiyat ${Number(event.change_percentage) > 0 ? "yükseldi" : "düştü"}: %${Math.abs(Number(event.change_percentage)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "Yeni fiyat bilgisi kaydedildi";
    if (event.event_type === "context.changed") {
        const before = Object.values(event.old_value ?? {})[0];
        const after = Object.values(event.new_value ?? {})[0];
        return `${Number(before).toLocaleString("tr-TR")} → ${Number(after).toLocaleString("tr-TR")} token`;
    }
    if (event.event_type === "leaderboard.changed") {
        const before = Object.values(event.old_value ?? {})[0];
        const after = Object.values(event.new_value ?? {})[0];
        return `Sıra #${before} → #${after}`;
    }
    return "Kaynak tarafından doğrulanan yeni gelişme";
}
export default function Home() {
    const [stats, setStats] = useState(emptyStats);
    const [models, setModels] = useState<ModelItem[]>([]);
    const [arena, setArena] = useState<Leaderboard | null>(null);
    const [swebench, setSwebench] = useState<Leaderboard | null>(null);
    const [swebenchLive, setSwebenchLive] = useState<Leaderboard | null>(null);
    const [tauBench, setTauBench] = useState<Leaderboard | null>(null);
    const [aaIntelligence, setAaIntelligence] = useState<Leaderboard | null>(null);
    const [aaCoding, setAaCoding] = useState<Leaderboard | null>(null);
    const [aaAgentic, setAaAgentic] = useState<Leaderboard | null>(null);
    const [livebench, setLivebench] = useState<Leaderboard | null>(null);
    const [mmluPro, setMmluPro] = useState<Leaderboard | null>(null);
    const [livecodebench, setLivecodebench] = useState<Leaderboard | null>(null);
    const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>("general");
    const [query, setQuery] = useState("");
    const [developers, setDevelopers] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [profileResults, setProfileResults] = useState<ModelItem[] | null>(null);
    const [profileTotal, setProfileTotal] = useState(0);
    const [profileLoading, setProfileLoading] = useState(false);
    const [researchBootstrap, setResearchBootstrap] = useState<ResearchBootstrap | null>(null);
    const [turkishBootstrap, setTurkishBootstrap] = useState<TurkishModel[] | null>(null);
    const skipInitialCatalogFetchRef = useRef(true);
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
    const [selected, setSelected] = useState<ModelItem[]>([]);
    const [detail, setDetail] = useState<ModelDetail | null>(null);
    const [detailMissing, setDetailMissing] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [compareProfiles, setCompareProfiles] = useState<Record<string, ComparedModel>>({});
    const [technology, setTechnology] = useState<TechnologyItem[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeSection, setActiveSection] = useState("overview");
    const [benchmarkInfoOpen, setBenchmarkInfoOpen] = useState(false);
    const [facets, setFacets] = useState<Facets>({ developers: [], providers: [], families: [], capabilities: [], licenses: [], openness: [], commercial_use: [], benchmark_focuses: [] });
    const [eventCategory, setEventCategory] = useState("any");
    const [eventDays, setEventDays] = useState("any");
    const [livebenchCategory, setLivebenchCategory] = useState("overall");
    const [mmluCategory, setMmluCategory] = useState("overall");
    const [sweLiveCategory, setSweLiveCategory] = useState("lite");
    const [tauCategory, setTauCategory] = useState("airline");
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const bootParams = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: "0",
            sort_by: "name",
            sort_order: "asc",
        });

        // Priority: show catalog models immediately — do NOT wait for turkish/research/leaderboards.
        fetch(`${API}/api/v1/models/search?${bootParams}`, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.items) {
                    setProfileResults(mapSearchModels(data.items as SearchModelItem[]));
                    setProfileTotal(Number(data.total ?? 0));
                }
            })
            .catch(() => { /* keep empty catalog */ });

        fetch(`${API}/api/v1/stats`, { signal })
            .then(r => r.json())
            .then(setStats)
            .catch(() => setError(true))
            .finally(() => setLoading(false));

        fetch(`${API}/api/v1/models/facets`, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setFacets(data); })
            .catch(() => { /* optional */ });

        // Background: never block the catalog on these.
        fetch(`${API}/api/v1/research?limit=${INITIAL_RESEARCH_LIMIT}&offset=0`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.items) {
                    setResearchBootstrap({
                        items: data.items,
                        total: Number(data.total ?? 0),
                        summary: data.summary ?? null,
                        limit: Number(data.limit ?? INITIAL_RESEARCH_LIMIT),
                    });
                }
            })
            .catch(() => { /* optional */ });

        fetch(`${API}/api/v1/models/turkish?limit=200`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.items) setTurkishBootstrap(data.items as TurkishModel[]);
            })
            .catch(() => { /* optional */ });

        fetch(`${API}/api/v1/leaderboards/arena?limit=${LEADERBOARD_LIMIT}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setArena(data as Leaderboard); })
            .catch(() => { /* optional */ });

        fetch(`${API}/api/v1/leaderboards/artificial-analysis/intelligence?limit=${LEADERBOARD_LIMIT}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setAaIntelligence(data as Leaderboard); })
            .catch(() => { /* optional */ });

        fetch(`${API}/api/v1/leaderboards/swe-bench?limit=${LEADERBOARD_LIMIT}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setSwebench(data as Leaderboard); })
            .catch(() => { /* optional */ });

        return () => controller.abort();
    }, []);
    useEffect(() => { fetch(`${API}/api/v1/technology`).then(r => r.ok ? r.json() : null).then(data => setTechnology(data?.items ?? [])).catch(() => { }); }, []);
    useEffect(() => {
        const boardKey = boardKeyForView(leaderboardView);
        const boards = {
            arena,
            swebench,
            swebenchLive,
            tauBench,
            aaIntelligence,
            aaCoding,
            aaAgentic,
            livebench,
            mmluPro,
            livecodebench,
        };
        const categories = { livebenchCategory, mmluCategory, sweLiveCategory, tauCategory };
        if (cachedLeaderboard(boardKey, boards, categories))
            return;

        const controller = new AbortController();
        fetch(leaderboardUrl(boardKey, livebenchCategory, mmluCategory, sweLiveCategory, tauCategory), { signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                applyLeaderboardData(boardKey, data as Leaderboard, {
                    setArena,
                    setSwebench,
                    setSwebenchLive,
                    setTauBench,
                    setAaIntelligence,
                    setAaCoding,
                    setAaAgentic,
                    setLivebench,
                    setMmluPro,
                    setLivecodebench,
                });
            })
            .catch(() => { /* keep previous board */ });

        return () => controller.abort();
    }, [leaderboardView, livebenchCategory, mmluCategory, sweLiveCategory, tauCategory, arena, swebench, swebenchLive, tauBench, aaIntelligence, aaCoding, aaAgentic, livebench, mmluPro, livecodebench]);
    useEffect(() => { if (!benchmarkInfoOpen)
        return; const close = (event: KeyboardEvent) => { if (event.key === "Escape")
        setBenchmarkInfoOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [benchmarkInfoOpen]);
    function navigateToSection(id: string) {
        setActiveSection(id);
        setSidebarOpen(false);
        window.scrollTo({ top: 0, behavior: "auto" });
    }
    function selectLeaderboardView(view: LeaderboardView) {
        setLeaderboardView(view);
        const category = LIVEBENCH_VIEW_CATEGORY[view];
        if (category)
            setLivebenchCategory(category);
    }
    const leaderboardBoards = useMemo(() => ({
        general: arena,
        coding: swebench,
        "swe-live": swebenchLive,
        "tau-bench": tauBench,
        intelligence: aaIntelligence,
        "aa-coding": aaCoding,
        agentic: aaAgentic,
        livebench,
        "mmlu-pro": mmluPro,
        livecodebench,
    }), [arena, swebench, swebenchLive, tauBench, aaIntelligence, aaCoding, aaAgentic, livebench, mmluPro, livecodebench]);
    const filterActive = minContext !== "" || maxInputPrice !== "" || maxOutputPrice !== "" || openness.length > 0 || licenses.length > 0 || commercialStatuses.length > 0 || modalities.length > 0 || capabilities.length > 0 || developers.length > 0 || providers.length > 0 || families.length > 0 || advancedness.length > 0 || benchmarkFocus !== "any";
    const isDefaultSort = (stack: CatalogSortSpec[]) => stack.length === 1 && stack[0].field === "name" && stack[0].order === "asc";
    const advancedActive = filterActive || !isDefaultSort(sortStack);
    const serverFiltering = activeSection === "models";
    useEffect(() => {
        if (!serverFiltering)
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
        const debounceMs = query.trim() ? 250 : 0;
        const timer = window.setTimeout(() => {
            setProfileLoading(true);
            fetch(`${API}/api/v1/models/search?${params}`, { signal: controller.signal })
                .then(response => {
                    if (!response.ok)
                        throw new Error("Filtre sonuçları alınamadı");
                    return response.json();
                })
                .then(data => {
                    setProfileTotal(data.total);
                    const mapped = mapSearchModels(data.items as SearchModelItem[]);
                    setProfileResults(current => {
                        if (page === 1)
                            return mapped;
                        const seen = new Set((current ?? []).map(item => item.id));
                        return [...(current ?? []), ...mapped.filter(item => !seen.has(item.id))];
                    });
                })
                .catch(error => { if (error.name !== "AbortError")
                    setError(true); })
                .finally(() => setProfileLoading(false));
        }, debounceMs);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [serverFiltering, page, query, developers, providers, families, minContext, maxInputPrice, maxOutputPrice, openness, licenses, commercialStatuses, modalities, capabilities, advancedness, benchmarkFocus, sortStack, filterActive]);
    useEffect(() => { if (selected.length < 2) {
        return;
    } const params = new URLSearchParams(); selected.forEach(model => params.append("ids", model.id)); fetch(`${API}/api/v1/models/compare?${params}`).then(r => r.ok ? r.json() : null).then(data => { if (data)
        setCompareProfiles(Object.fromEntries((data.items as ComparedModel[]).map(item => [item.id, item]))); }).catch(() => setError(true)); }, [selected]);
    const companies = useMemo(() => facets.developers.length ? facets.developers : Array.from(new Map(models.map(m => [m.company.slug, m.company])).values()).sort((a, b) => a.name.localeCompare(b.name)), [models, facets.developers]);
    const developerSites = useMemo(() => Object.fromEntries(companies.map(company => [company.slug, "website_url" in company ? company.website_url : null])), [companies]);
    const filtered = serverFiltering ? (profileResults ?? []) : models;
    const resultTotal = serverFiltering ? profileTotal : stats.models;
    const catalogHasMore = serverFiltering && filtered.length < resultTotal;
    const catalogBootReady = profileResults !== null && profileResults.length > 0;
    const visible = serverFiltering ? filtered : filtered.slice(0, PAGE_SIZE);
    function toggle(model: ModelItem) {
        setSelected(current => {
            const removing = current.some(item => item.id === model.id);
            if (!removing && current.length < 3)
                trackEvent(API, "model_compared", { model_id: model.id, related_model_ids: [...current.map(item => item.id), model.id] });
            return removing ? current.filter(item => item.id !== model.id) : current.length < 3 ? [...current, model] : current;
        });
    }
    function resetAdvanced() { setMinContext(""); setMaxInputPrice(""); setMaxOutputPrice(""); setOpenness([]); setLicenses([]); setCommercialStatuses([]); setModalities([]); setCapabilities([]); setProviders([]); setDevelopers([]); setFamilies([]); setAdvancedness([]); setBenchmarkFocus("any"); setSortStack(DEFAULT_SORT_STACK); setPage(1); }
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
        chips.push({ key: "ctx", label: `${Number(minContext).toLocaleString("tr-TR")}+ ctx`, clear: () => { setMinContext(""); setPage(1); } }); if (maxInputPrice)
        chips.push({ key: "in", label: `Girdi ≤ $${maxInputPrice}`, clear: () => { setMaxInputPrice(""); setPage(1); } }); if (maxOutputPrice)
        chips.push({ key: "out", label: `Çıktı ≤ $${maxOutputPrice}`, clear: () => { setMaxOutputPrice(""); setPage(1); } }); if (benchmarkFocus !== "any")
        chips.push({ key: "bench", label: `Odağı: ${benchmarkFocus}`, clear: () => { setBenchmarkFocus("any"); setPage(1); } }); advancedness.forEach(item => chips.push({ key: `adv-${item}`, label: ADVANCEDNESS_LABELS[item] ?? item, clear: () => toggleAdvancedness(item) })); families.forEach(item => chips.push({ key: `family-${item}`, label: item, clear: () => toggleList(item, setFamilies) })); openness.forEach(item => chips.push({ key: `open-${item}`, label: opennessLabels[item] ?? item, clear: () => toggleList(item, setOpenness) })); licenses.forEach(item => chips.push({ key: `license-${item}`, label: item.replaceAll("_", " "), clear: () => toggleList(item, setLicenses) })); commercialStatuses.forEach(item => chips.push({ key: `commercial-${item}`, label: `Ticari: ${item.replaceAll("_", " ")}`, clear: () => toggleList(item, setCommercialStatuses) })); modalities.forEach(item => chips.push({ key: `mod-${item}`, label: trModality(item), clear: () => toggleModality(item) })); capabilities.forEach(item => chips.push({ key: `cap-${item}`, label: trCapability(item), clear: () => toggleCapability(item) })); return chips; }, [query, developers, sortStack, providers, minContext, maxInputPrice, maxOutputPrice, benchmarkFocus, families, openness, licenses, commercialStatuses, modalities, capabilities, companies, facets.providers]);
    useEffect(() => {
        if (activeSection !== "models" || query.trim().length < 2)
            return;
        const timer = window.setTimeout(() => trackEvent(API, "search_performed", { filters: { query: query.trim() } }), 700);
        return () => window.clearTimeout(timer);
    }, [activeSection, query]);
    useEffect(() => {
        if (activeSection !== "models" || !filterActive)
            return;
        const timer = window.setTimeout(() => trackEvent(API, "filter_applied", { filters: { developers, providers, families, min_context: minContext || null, max_input_price: maxInputPrice || null, max_output_price: maxOutputPrice || null, openness, licenses, commercial_use: commercialStatuses, modalities, capabilities, benchmark_focus: benchmarkFocus } }), 700);
        return () => window.clearTimeout(timer);
    }, [activeSection, filterActive, developers, providers, families, minContext, maxInputPrice, maxOutputPrice, openness, licenses, commercialStatuses, modalities, capabilities, benchmarkFocus]);
    async function openDetailById(modelId: string) {
        setDetailLoading(true);
        setDetail(null);
        setDetailMissing(null);
        try {
            const response = await fetch(`${API}/api/v1/models/${modelId}`);
            if (!response.ok)
                throw new Error("Model ayrıntıları alınamadı");
            setDetail(await response.json());
            trackEvent(API, "model_viewed", { model_id: modelId });
        }
        catch {
            setDetailMissing("Model ayrıntıları yüklenemedi.");
        }
        finally {
            setDetailLoading(false);
        }
    }
    async function openDetail(model: ModelItem) {
        await openDetailById(model.id);
    }
    async function inspectLeaderboardModel(item: LeaderboardItem) {
        if (item.catalog_model_id) {
            await openDetailById(item.catalog_model_id);
            return;
        }
        const local = findLocalModel(item.model_name, item.organization, models);
        if (local) {
            await openDetailById(local.id);
            return;
        }
        setDetailLoading(true);
        setDetail(null);
        setDetailMissing(null);
        try {
            const params = new URLSearchParams({ name: item.model_name });
            if (item.organization)
                params.set("organization", item.organization);
            const resolved = await fetch(`${API}/api/v1/models/resolve?${params}`);
            if (resolved.ok) {
                const data = await resolved.json() as { id: string };
                await openDetailById(data.id);
                return;
            }
            const search = new URLSearchParams({ search: item.model_name, limit: "8", sort_by: "name" });
            const response = await fetch(`${API}/api/v1/models/search?${search}`);
            if (!response.ok)
                throw new Error("Arama başarısız");
            const data = await response.json() as { items?: SearchModelItem[] };
            const items = data.items ?? [];
            const orgKey = item.organization.toLowerCase().trim();
            const key = normalizeModelKey(item.model_name);
            const match = items.find(entry => entry.developer.name.toLowerCase() === orgKey || entry.developer.slug === orgKey)
                ?? items.find(entry => normalizeModelKey(entry.slug) === key || normalizeModelKey(entry.name) === key)
                ?? items[0];
            if (match) {
                await openDetailById(match.id);
                return;
            }
            setDetailMissing(`${item.model_name} henüz model kataloğunda eşleşmedi. Collector güncellemesi sonrası tekrar deneyin.`);
        }
        catch {
            setDetailMissing(`${item.model_name} için katalog bilgisi alınamadı.`);
        }
        finally {
            setDetailLoading(false);
        }
    }
    function closeDetail() {
        setDetail(null);
        setDetailMissing(null);
    }
    return <div className={`app-shell${activeSection === "leaderboard" ? " leaderboard-shell" : ""}`}>
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Ana navigasyon"><button type="button" className="sidebar-brand" onClick={() => navigateToSection("overview")}><span className="brand-mark brand-radar" aria-hidden="true"><i /><b /><em /><em /><em /></span><span><strong>LLM RADAR</strong><small>MODEL INTELLIGENCE</small></span></button><nav className="sidebar-nav">{sidebarGroups.map(group => <div className="sidebar-group" key={group.label}><p>{group.label}</p>{group.items.map(item => <button type="button" key={item.id} className={activeSection === item.id ? "active" : ""} aria-current={activeSection === item.id ? "page" : undefined} onClick={() => navigateToSection(item.id)}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span></button>)}</div>)}</nav><div className="sidebar-status"><span /><div><strong>Veri akışı aktif</strong><small>{stats.models || "—"} model izleniyor</small></div></div></aside>
    {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="Menüyü kapat" onClick={() => setSidebarOpen(false)}/>}
    {!sidebarOpen && <button className="sidebar-toast" type="button" aria-label="Menüyü aç" onClick={() => setSidebarOpen(true)}><span className="sidebar-toast-mark brand-radar" aria-hidden="true"><i /><b /><em /><em /><em /></span><span className="sidebar-toast-label">Menü</span></button>}
    <main className={`main-content${activeSection === "leaderboard" ? " leaderboard-layout" : activeSection === "models" ? " catalog-layout" : activeSection === "turkish" ? " turkish-layout" : activeSection === "research" ? " rs-layout" : activeSection === "radar" ? " tr-layout" : activeSection === "sources" ? " sources-layout" : ""}`} id="top">
    {activeSection !== "research" && activeSection !== "radar" && activeSection !== "sources" && (
    <header className="topbar"><div className="topbar-context"><span>{sectionMeta[activeSection]?.group ?? "LLM Radar"}</span><strong>{sectionMeta[activeSection]?.title ?? "Model ve benchmark görünümü"}</strong></div><div className="live-pill"><span /> CANLI</div></header>
    )}
    <div className={`app-view${activeSection === "leaderboard" ? " app-view-leaderboard" : activeSection === "models" ? " app-view-catalog" : activeSection === "turkish" ? " app-view-turkish" : ""}`}>
    {activeSection === "overview" && <>
    <section className="hero" id="overview"><div><p className="eyebrow">LLM INTELLIGENCE PLATFORM</p><h1>Yapay zekâ dünyasının<br /><em>nabzını tut.</em></h1><p className="hero-copy">Modelleri, fiyatları ve teknoloji değişimlerini tek merkezden, kaynaklarıyla birlikte takip et.</p></div><div className="radar"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="orbit orbit-three"/><span className="sweep"/><span className="dot dot-one"/><span className="dot dot-two"/><span className="dot dot-three"/><b>{stats.models || "—"}</b><small>İZLENEN MODEL</small></div></section>
    {error && <div className="error">API bağlantısı kurulamadı. Backend servisinin çalıştığını kontrol et.</div>}
    <section className="metric-grid">{[["İzlenen model", stats.models], ["Takip edilen firma", stats.companies], ["Fiyat gözlemi", stats.price_observations], ["Tespit edilen olay", stats.change_events]].map(([label, value]) => <article className="metric" key={String(label)}><p>{label}</p><strong>{loading ? "—" : compact(Number(value))}</strong><span>● Güncel veri</span></article>)}</section>
    </>}

    {activeSection === "leaderboard" && (
    <LeaderboardPage
        view={leaderboardView}
        onViewChange={selectLeaderboardView}
        boards={leaderboardBoards}
        benchmarkInfo={benchmarkInfo}
        onOpenInfo={() => setBenchmarkInfoOpen(true)}
        livebenchCategory={livebenchCategory}
        onLivebenchCategoryChange={value => { setLivebenchCategory(value); setLeaderboardView("livebench"); }}
        mmluCategory={mmluCategory}
        onMmluCategoryChange={setMmluCategory}
        sweLiveCategory={sweLiveCategory}
        onSweLiveCategoryChange={setSweLiveCategory}
        tauCategory={tauCategory}
        onTauCategoryChange={setTauCategory}
        onInspectModel={inspectLeaderboardModel}
    />
    )}

    {activeSection === "models" && (
    <ModelCatalogPage
        loading={!catalogBootReady && loading}
        modelCount={stats.models}
        resultTotal={resultTotal}
        profileLoading={profileLoading && !catalogBootReady}
        query={query}
        onQueryChange={value => { setQuery(value); setPage(1); }}
        developers={developers}
        onToggleDeveloper={toggleDeveloper}
        onClearDevelopers={() => { setDevelopers([]); setPage(1); }}
        companies={companies}
        advancedOpen={advancedOpen}
        onAdvancedToggle={() => setAdvancedOpen(open => !open)}
        advancedActive={advancedActive}
        sortStack={sortStack}
        onSort={changeSort}
        sortLabels={sortLabels}
        activeFilters={activeModelFilters}
        onResetFilters={resetAdvanced}
        facets={facets}
        minContext={minContext}
        onMinContextChange={value => { setMinContext(value); setPage(1); }}
        maxInputPrice={maxInputPrice}
        onMaxInputPriceChange={value => { setMaxInputPrice(value); setPage(1); }}
        maxOutputPrice={maxOutputPrice}
        onMaxOutputPriceChange={value => { setMaxOutputPrice(value); setPage(1); }}
        providers={providers}
        onToggleProvider={toggleProvider}
        onClearProviders={() => { setProviders([]); setPage(1); }}
        openness={openness}
        licenses={licenses}
        commercialStatuses={commercialStatuses}
        modalities={modalities}
        capabilities={capabilities}
        families={families}
        advancedness={advancedness}
        onToggleAdvancedness={toggleAdvancedness}
        onClearAdvancedness={() => { setAdvancedness([]); setPage(1); }}
        benchmarkFocus={benchmarkFocus}
        onBenchmarkFocusChange={value => { setBenchmarkFocus(value); setPage(1); }}
        onToggleOpenness={value => toggleList(value, setOpenness)}
        onToggleLicense={value => toggleList(value, setLicenses)}
        onToggleCommercial={value => toggleList(value, setCommercialStatuses)}
        onToggleModality={toggleModality}
        onToggleCapability={toggleCapability}
        onToggleFamily={value => toggleList(value, setFamilies)}
        runtimeCapabilityOptions={runtimeCapabilityOptions}
        trModality={trModality}
        trCapability={value => capabilityLabels[value] ?? value}
        models={visible}
        selectedIds={selected.map(item => item.id)}
        onToggleSelect={toggle}
        onInspect={openDetail}
        hasMore={catalogHasMore}
        loadingMore={profileLoading && page > 1}
        onLoadMore={() => { if (catalogHasMore && !profileLoading) setPage(current => current + 1); }}
        money={money}
        developerSites={developerSites}
    />
    )}

    {activeSection === "compare" && (
    <section className="compare-section app-page" id="compare">
        <div className="section-title compare-title-row">
            <div>
                <p className="kicker">MODEL KARŞILAŞTIRMA</p>
                <h2>Akıllı model karşılaştırması.</h2>
            </div>
            <p>Katalogdan en fazla 3 model seç; fiyat, context, benchmark, yetenekler ve kullanım senaryosuna göre öneri al.</p>
            <button type="button" className="compare-catalog-btn" onClick={() => navigateToSection("models")}>◫ Model kataloğundan seç</button>
        </div>
        {selected.length === 0 ? (
            <div className="compare-empty">
                <p>Karşılaştırmak istediğin modelleri katalogdan seç.</p>
                <p className="compare-empty-hint">Tablodaki <strong>+</strong> düğmesiyle model ekle; en az 2 model seçince akıllı özet ve senaryo önerileri açılır.</p>
                <button type="button" className="compare-catalog-btn compare-catalog-btn-large" onClick={() => navigateToSection("models")}>Model kataloğuna git</button>
            </div>
        ) : (
            <>
                <div className="compare-toolbar">
                    <p><strong>{selected.length}</strong> / 3 model seçildi</p>
                    <button type="button" className="compare-catalog-btn" onClick={() => navigateToSection("models")}>+ Model ekle / değiştir</button>
                </div>
                {selected.length < 2 ? (
                    <div className="compare-hint">Akıllı karşılaştırma için bir model daha seç. Katalogdaki <strong>+</strong> düğmesini kullanabilirsin.</div>
                ) : (
                    <SmartModelComparison models={selected} profiles={compareProfiles} developerSites={developerSites} onRemove={toggle} onInspect={openDetail} />
                )}
            </>
        )}
    </section>
    )}

    {insightViews.has(activeSection as InsightsView) && (
    <ProductInsights
        api={API}
        view={activeSection as InsightsView}
        onNavigate={navigateToSection}
        turkishBootstrap={turkishBootstrap}
        onOpenWeight={() => {
            setOpenness(["open_weight"]);
            setPage(1);
            setAdvancedOpen(true);
            navigateToSection("models");
        }}
    />
    )}

    {activeSection === "events" && (
    <EventsPage
        api={API}
        category={eventCategory}
        days={eventDays}
        onCategoryChange={setEventCategory}
        onDaysChange={setEventDays}
    />
    )}

    {activeSection === "research" && (
    <ResearchPage api={API} bootstrap={researchBootstrap} />
    )}

    {activeSection === "radar" && (
    <TechnologyRadarPage
        api={API}
        signals={technology}
        onViewAllEvents={() => navigateToSection("events")}
    />
    )}

    {activeSection === "sources" && (
    <SourcesPage api={API} />
    )}

    {activeSection === "feedback" && (
    <FeedbackPage api={API}/>
    )}

    </div>

    {activeSection !== "leaderboard" && activeSection !== "models" && activeSection !== "turkish" && activeSection !== "events" && activeSection !== "research" && activeSection !== "radar" && activeSection !== "sources" && <footer className="site-foot"><span>LLM RADAR / 2026</span><span>OpenRouter kaynaklı • Yakın gerçek zamanlı takip</span></footer>}
    {benchmarkInfoOpen && <div className="benchmark-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget)
        setBenchmarkInfoOpen(false); }}><section className="benchmark-info-modal" role="dialog" aria-modal="true" aria-labelledby="benchmark-info-title"><button type="button" className="benchmark-modal-close" aria-label="Benchmark açıklamasını kapat" onClick={() => setBenchmarkInfoOpen(false)}>×</button><p className="kicker">BENCHMARK REHBERİ</p><h2 id="benchmark-info-title">{benchmarkInfo[leaderboardView].name}</h2><p>{benchmarkInfo[leaderboardView].summary}</p><dl><div><dt>Ne ölçüyor?</dt><dd>{benchmarkInfo[leaderboardView].measure}</dd></div><div><dt>Nasıl okunmalı?</dt><dd>{benchmarkInfo[leaderboardView].reading}</dd></div></dl></section></div>}

    {(detailLoading || detail || detailMissing) && <div className="modal-backdrop" role="button" tabIndex={0} aria-label="Model ayrıntılarını kapat" onClick={e => { if (e.target === e.currentTarget)
        closeDetail(); }} onKeyDown={e => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ")
        closeDetail(); }}><aside className="detail-drawer">{detailLoading ? <div className="drawer-loading">Model ayrıntıları yükleniyor…</div> : detail ? <><button className="drawer-close" onClick={closeDetail}>×</button><p className="kicker">{detail.company.name}</p><h2>{detail.name}</h2><code>{detail.slug}</code><p className="description">{detail.description || "Bu model için açıklama bulunmuyor."}</p><div className="detail-stats"><div><span>Bağlam</span><strong>{detail.context_window?.toLocaleString("tr-TR") ?? "—"}</strong></div><div><span>Tokenlaştırıcı</span><strong>{detail.tokenizer || "—"}</strong></div><div><span>Girdi fiyatı</span><strong>{money(detail.price_history[0]?.input)}</strong></div><div><span>Çıktı fiyatı</span><strong>{money(detail.price_history[0]?.output)}</strong></div></div><h3>Benchmark karnesi</h3>{detail.benchmarks.length ? <div className="benchmark-list">{detail.benchmarks.map(score => <a key={score.benchmark_slug} href={score.source_url} target="_blank" rel="noreferrer"><span>{score.benchmark}</span><strong>#{score.rank} · {score.score.toFixed(1)}</strong></a>)}</div> : <p className="description">Bu model adıyla eşleşen resmî benchmark sonucu henüz yok.</p>}<h3>Modaliteler</h3><div className="tags">{[...(detail.capabilities.input_modalities || []), ...(detail.capabilities.output_modalities || [])].map((tag, i) => <span key={`${tag}-${i}`}>{trModality(tag)}</span>)}</div>{(() => { const srcs = detail.sources && detail.sources.length > 0 ? detail.sources : [{ name: "OpenRouter", url: `https://openrouter.ai/${detail.slug}`, reliability: "third_party", source_class: "independent" }]; return srcs.map((src, i) => { const rawUrl = src.url ?? ""; const isOpenRouterSource = src.name.toLowerCase().includes("openrouter") || rawUrl.includes("openrouter.ai/api/v1/models"); const href = isOpenRouterSource ? `https://openrouter.ai/${detail.slug}` : rawUrl; const canOpen = canOpenSourceUrl(href); const label = src.reliability === "official_api" ? "Resmî API verisi" : src.reliability === "official_document" ? "Resmî dokümantasyon" : src.reliability === "independent_measurement" ? "Bağımsız ölçüm" : src.reliability === "academic" ? "Akademik kaynak" : src.reliability === "third_party" ? "Üçüncü taraf sağlayıcı verisi" : "Topluluk verisi"; return <div className="source-card" key={i}><span>KAYNAK VE GÜVENİLİRLİK</span><strong>{src.name === "openrouter" ? "OpenRouter" : src.name}</strong><p>{label}</p>{canOpen ? <a href={href} target="_blank" rel="noreferrer">Kaynağı aç ↗</a> : <small className="source-link-disabled">Görüntülenebilir kaynak sayfası yok</small>}</div>; }); })()}</> : <><button className="drawer-close" onClick={closeDetail}>×</button><p className="kicker">MODEL KATALOĞU</p><h2>Model bulunamadı</h2><p className="description">{detailMissing}</p></>}</aside></div>}
    </main>
  </div>;
}
