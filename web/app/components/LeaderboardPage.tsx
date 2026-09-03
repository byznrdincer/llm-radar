"use client";

import { useEffect, useState } from "react";
import ModelAvatar from "./ModelAvatar";
import { useInfiniteScroll } from "../lib/useInfiniteScroll";
import { useLanguage, type Language } from "../lib/i18n";

export type LeaderboardItem = {
    model_name: string;
    organization: string;
    license: string;
    rating: number;
    rating_lower: number | null;
    rating_upper: number | null;
    vote_count: number | null;
    rank: number;
    category: string;
    leaderboard_publish_date: string;
    catalog_model_id: string | null;
    openness: string | null;
    details: Record<string, unknown>;
};

export type Leaderboard = {
    source: {
        name: string;
        url: string;
        benchmark: string;
    };
    category: string;
    published_at: string | null;
    items: LeaderboardItem[];
};

export type LeaderboardView =
    | "general"
    | "coding"
    | "swe-live"
    | "tau-bench"
    | "intelligence"
    | "aa-coding"
    | "agentic"
    | "livebench"
    | "livebench-math"
    | "livebench-reasoning"
    | "livebench-coding"
    | "mmlu-pro"
    | "livecodebench";

type Boards = {
    general: Leaderboard | null;
    coding: Leaderboard | null;
    "swe-live": Leaderboard | null;
    "tau-bench": Leaderboard | null;
    intelligence: Leaderboard | null;
    "aa-coding": Leaderboard | null;
    agentic: Leaderboard | null;
    livebench: Leaderboard | null;
    "mmlu-pro": Leaderboard | null;
    livecodebench: Leaderboard | null;
};

type BenchmarkInfo = {
    name: string;
    summary: string;
    measure: string;
    reading: string;
};

type TabDef = {
    id: LeaderboardView;
    group: string;
    label: Record<Language, string>;
    hint: Record<Language, string>;
    board: keyof Boards;
};

const benchmarkTabs: TabDef[] = [
    { id: "general", group: "Genel", label: { tr: "Arena", en: "Arena" }, hint: { tr: "İnsan tercihi", en: "Human preference" }, board: "general" },
    { id: "intelligence", group: "Genel", label: { tr: "AA Zekâ", en: "AA Intelligence" }, hint: { tr: "Bileşik endeks", en: "Composite index" }, board: "intelligence" },
    { id: "coding", group: "Kodlama", label: { tr: "SWE-bench", en: "SWE-bench" }, hint: { tr: "Verified agent", en: "Verified agent" }, board: "coding" },
    { id: "swe-live", group: "Kodlama", label: { tr: "SWE Live", en: "SWE Live" }, hint: { tr: "Güncel görevler", en: "Live tasks" }, board: "swe-live" },
    { id: "livecodebench", group: "Kodlama", label: { tr: "LiveCodeBench", en: "LiveCodeBench" }, hint: { tr: "Pass@1 kod", en: "Pass@1 code" }, board: "livecodebench" },
    { id: "aa-coding", group: "Kodlama", label: { tr: "AA Kodlama", en: "AA Coding" }, hint: { tr: "Bileşik endeks", en: "Composite index" }, board: "aa-coding" },
    { id: "livebench", group: "Bilgi", label: { tr: "LiveBench", en: "LiveBench" }, hint: { tr: "Genel skor", en: "Overall score" }, board: "livebench" },
    { id: "livebench-math", group: "Bilgi", label: { tr: "LB Math", en: "LB Math" }, hint: { tr: "Matematik", en: "Math" }, board: "livebench" },
    { id: "livebench-reasoning", group: "Bilgi", label: { tr: "LB Reasoning", en: "LB Reasoning" }, hint: { tr: "Akıl yürütme", en: "Reasoning" }, board: "livebench" },
    { id: "livebench-coding", group: "Bilgi", label: { tr: "LB Coding", en: "LB Coding" }, hint: { tr: "Kod üretimi", en: "Code generation" }, board: "livebench" },
    { id: "mmlu-pro", group: "Bilgi", label: { tr: "MMLU-Pro", en: "MMLU-Pro" }, hint: { tr: "Akademik bilgi", en: "Academic knowledge" }, board: "mmlu-pro" },
    { id: "agentic", group: "Agent", label: { tr: "AA Agentic", en: "AA Agentic" }, hint: { tr: "Araç kullanımı", en: "Tool use" }, board: "agentic" },
    { id: "tau-bench", group: "Agent", label: { tr: "τ-bench", en: "τ-bench" }, hint: { tr: "Pass@1 görev", en: "Pass@1 task" }, board: "tau-bench" },
];

const viewTitles: Record<LeaderboardView, Record<Language, string>> = {
    general: { tr: "İnsan tercihi sıralaması", en: "Human preference ranking" },
    coding: { tr: "SWE-bench Verified", en: "SWE-bench Verified" },
    "swe-live": { tr: "SWE-bench Live", en: "SWE-bench Live" },
    "tau-bench": { tr: "τ-bench araç kullanımı", en: "τ-bench tool use" },
    intelligence: { tr: "Zekâ endeksi", en: "Intelligence index" },
    "aa-coding": { tr: "Kodlama endeksi", en: "Coding index" },
    agentic: { tr: "Agentic endeksi", en: "Agentic index" },
    livebench: { tr: "LiveBench genel", en: "LiveBench overall" },
    "livebench-math": { tr: "LiveBench — Matematik", en: "LiveBench — Math" },
    "livebench-reasoning": { tr: "LiveBench — Reasoning", en: "LiveBench — Reasoning" },
    "livebench-coding": { tr: "LiveBench — Kodlama", en: "LiveBench — Coding" },
    "mmlu-pro": { tr: "MMLU-Pro bilgi", en: "MMLU-Pro knowledge" },
    livecodebench: { tr: "LiveCodeBench kod üretimi", en: "LiveCodeBench code generation" },
};

const viewHints: Record<LeaderboardView, Record<Language, string>> = {
    general: {
        tr: "Arena Rating puanına göre sıralı · oy sayısı ve güven aralığı bağlam bilgisidir",
        en: "Ranked by Arena Rating score · vote count and confidence interval are contextual",
    },
    coding: {
        tr: "Gerçek GitHub sorunlarında çözülen görev oranı",
        en: "Task resolution rate on real GitHub issues",
    },
    "swe-live": {
        tr: "Güncel yazılım görevlerinde çözüm oranı",
        en: "Resolution rate on live software tasks",
    },
    "tau-bench": {
        tr: "Gerçekçi araç kullanımı görevlerinde Pass@1",
        en: "Pass@1 on realistic tool-use tasks",
    },
    intelligence: {
        tr: "Artificial Analysis bağımsız zekâ endeksi",
        en: "Artificial Analysis independent intelligence index",
    },
    "aa-coding": {
        tr: "Artificial Analysis kodlama endeksi",
        en: "Artificial Analysis coding index",
    },
    agentic: {
        tr: "Artificial Analysis agentic görev endeksi",
        en: "Artificial Analysis agentic task index",
    },
    livebench: {
        tr: "Kontaminasyonu azaltılmış güncel değerlendirme",
        en: "Contamination-reduced live evaluation",
    },
    "livebench-math": {
        tr: "LiveBench matematik alt kategorisi",
        en: "LiveBench math subcategory",
    },
    "livebench-reasoning": {
        tr: "LiveBench akıl yürütme alt kategorisi",
        en: "LiveBench reasoning subcategory",
    },
    "livebench-coding": {
        tr: "LiveBench kodlama alt kategorisi",
        en: "LiveBench coding subcategory",
    },
    "mmlu-pro": {
        tr: "14 alanda akademik bilgi testi",
        en: "Academic knowledge test across 14 domains",
    },
    livecodebench: {
        tr: "Güncel kod problemlerinde Pass@1",
        en: "Pass@1 on live coding problems",
    },
};

const tabGroups = ["Genel", "Kodlama", "Bilgi", "Agent"] as const;

const groupLabels: Record<Language, Record<(typeof tabGroups)[number], string>> = {
    tr: { Genel: "Genel", Kodlama: "Kodlama", Bilgi: "Bilgi", Agent: "Agent" },
    en: { Genel: "General", Kodlama: "Coding", Bilgi: "Knowledge", Agent: "Agent" },
};

// Profildeki openness alanı boş olsa bile, lisans "Proprietary" olarak
// doğrulanmışsa (bkz. backend _known_family_license) bu tek yönlü ve
// belirsizlik taşımayan bir sinyaldir: kapalı lisans asla açık ağırlık/
// açık kaynak anlamına gelmez. Open/Apache/MIT gibi lisanslar ise
// open_source ile open_weight arasında ayrım yapmaya yetmediği için
// burada tahmin yürütülmüyor - sadece "proprietary" çıkarımı yapılır.
function effectiveOpenness(
    openness: string | null | undefined,
    license: string | null | undefined,
): "open_source" | "open_weight" | "proprietary" | null {
    const normalized = (openness ?? "").trim().toLowerCase();
    if (normalized === "open_source" || normalized === "open_weight" || normalized === "proprietary")
        return normalized;
    if ((license ?? "").trim().toLowerCase() === "proprietary")
        return "proprietary";
    return null;
}

function sourceBadge(
    openness: string | null | undefined,
    license: string | null | undefined,
    language: Language,
) {
    const resolved = effectiveOpenness(openness, license);

    if (resolved === "open_source")
        return { label: "Open Source", description: language === "tr" ? "Açık kaynak model" : "Open source model", kind: "open" };

    if (resolved === "open_weight")
        return { label: "Open Weight", description: language === "tr" ? "Model ağırlıkları indirilebilir" : "Model weights downloadable", kind: "open" };

    if (resolved === "proprietary")
        return { label: "Closed Source", description: language === "tr" ? "Kapalı model / servis erişimi" : "Closed model / API access", kind: "closed" };

    const normalizedLicense = (license ?? "").trim().toLowerCase();
    if (normalizedLicense === "not applicable" || normalizedLicense === "n/a")
        return { label: "N/A", description: language === "tr" ? "Tek bir modele ait olmayan benchmark girdisi" : "Benchmark entry not tied to a single model", kind: "na" };

    return { label: "?", description: language === "tr" ? "Açıklık sınıfı henüz doğrulanmadı" : "Openness class not yet verified", kind: "unknown" };
}

function resolveBoard(view: LeaderboardView, boards: Boards): Leaderboard | null {
    const tab = benchmarkTabs.find(item => item.id === view);
    return tab ? boards[tab.board] : null;
}

function rankTone(rank: number) {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return "default";
}

function organizationSlug(organization: string) {
    return organization
        .trim()
        .toLocaleLowerCase("en-US")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function formatScore(item: LeaderboardItem, isArena: boolean, isSwe: boolean, isSweLive: boolean, isTau: boolean, locale: string) {
    if (isArena) return Math.round(item.rating).toLocaleString(locale);
    if (isSwe || isSweLive || isTau) return `${item.rating.toFixed(1)}%`;
    return item.rating.toFixed(1);
}

function formatSecondary(item: LeaderboardItem, isArena: boolean, isSwe: boolean, isSweLive: boolean, isTau: boolean, isLive: boolean, isMmlu: boolean, language: Language, locale: string) {
    if (isArena) return item.vote_count != null ? `${item.vote_count.toLocaleString(locale)} ${language === "tr" ? "oy" : "votes"}` : "—";
    if (isSwe) return String(item.details.evaluation_date ?? "—");
    if (isSweLive) return String(item.details.submission_date ?? "—");
    if (isTau) return String(item.details.benchmark_version ?? "—");
    if (isLive) return String(item.details.release ?? "—");
    if (isMmlu) return String(item.details.evaluation_source ?? "—");
    return String(item.details.benchmark_version ?? "—");
}

function formatTertiary(item: LeaderboardItem, isArena: boolean, isSwe: boolean, isSweLive: boolean, language: Language) {
    if (isArena && item.rating_lower != null && item.rating_upper != null)
        return `${language === "tr" ? "Güven" : "Confidence"}: ${Math.round(item.rating_lower)}–${Math.round(item.rating_upper)}`;
    if (isSwe) return String(item.details.agent ?? "—");
    if (isSweLive) return String(item.details.agent_harness ?? "—");
    return item.leaderboard_publish_date;
}

type Props = {
    view: LeaderboardView;
    onViewChange: (view: LeaderboardView) => void;
    boards: Boards;
    benchmarkInfo: Record<LeaderboardView, BenchmarkInfo>;
    onOpenInfo: () => void;
    livebenchCategory: string;
    onLivebenchCategoryChange: (value: string) => void;
    mmluCategory: string;
    onMmluCategoryChange: (value: string) => void;
    sweLiveCategory: string;
    onSweLiveCategoryChange: (value: string) => void;
    tauCategory: string;
    onTauCategoryChange: (value: string) => void;
    onInspectModel: (item: LeaderboardItem) => void;
};

export default function LeaderboardPage({
    view,
    onViewChange,
    boards,
    benchmarkInfo,
    onOpenInfo,
    livebenchCategory,
    onLivebenchCategoryChange,
    mmluCategory,
    onMmluCategoryChange,
    sweLiveCategory,
    onSweLiveCategoryChange,
    tauCategory,
    onTauCategoryChange,
    onInspectModel,
}: Props) {
    const { language, locale } = useLanguage();
    const board = resolveBoard(view, boards);
    const [visibleCount, setVisibleCount] = useState(20);
    const [opennessFilter, setOpennessFilter] = useState<
        "all" | "open_source" | "open_weight" | "proprietary"
    >("all");
    const isArena = view === "general";
    const isSwe = view === "coding";
    const isSweLive = view === "swe-live";
    const isTau = view === "tau-bench";
    const isLive = view === "livebench" || view.startsWith("livebench-");
    const isMmlu = view === "mmlu-pro";
    const scoreLabel = isArena
        ? "Arena Rating"
        : isSwe || isSweLive
            ? (language === "tr" ? "Çözüm oranı" : "Resolution rate")
            : isTau
                ? "Pass@1"
                : (language === "tr" ? "Puan" : "Score");
    const allItems = board?.items ?? [];
    const filteredItems = opennessFilter === "all"
        ? allItems
        : allItems.filter(item => effectiveOpenness(item.openness, item.license) === opennessFilter);

    const visibleItems = filteredItems.slice(0, visibleCount);
    const hasMore = visibleCount < filteredItems.length;
    const ratings = allItems.map(item => item.rating);
    const maximumRating = ratings.length ? Math.max(...ratings) : 0;
    const minimumRating = ratings.length ? Math.min(...ratings) : 0;

    useEffect(() => {
        setVisibleCount(20);
    }, [view, board?.category, board?.published_at]);

    const sentinelRef = useInfiniteScroll(() => {
        setVisibleCount(count => count + 20);
    }, hasMore);

    function scoreWidth(rating: number) {
        if (maximumRating === minimumRating) return 100;
        return 35 + ((rating - minimumRating) / (maximumRating - minimumRating)) * 65;
    }

    const opennessOptions: [string, string][] = [
        ["all", language === "tr" ? "Tümü" : "All"],
        ["open_source", "Open Source"],
        ["open_weight", "Open Weight"],
        ["proprietary", "Closed Source"],
    ];

    const livebenchOptions: [string, string][] = [
        ["overall", language === "tr" ? "Genel" : "Overall"],
        ["reasoning", "Reasoning"],
        ["math", language === "tr" ? "Matematik" : "Math"],
        ["coding", language === "tr" ? "Kodlama" : "Coding"],
        ["data_analysis", language === "tr" ? "Veri" : "Data"],
        ["writing", language === "tr" ? "Yazma" : "Writing"],
        ["instruction_following", language === "tr" ? "Talimat" : "Instruction"],
        ["agentic_coding", "Agentic"],
    ];

    const mmluOptions: [string, string][] = [
        ["overall", language === "tr" ? "Genel" : "Overall"],
        ["biology", language === "tr" ? "Biyoloji" : "Biology"],
        ["business", language === "tr" ? "İşletme" : "Business"],
        ["chemistry", language === "tr" ? "Kimya" : "Chemistry"],
        ["computer_science", "CS"],
        ["economics", language === "tr" ? "Ekonomi" : "Economics"],
        ["engineering", language === "tr" ? "Müh." : "Eng."],
        ["health", language === "tr" ? "Sağlık" : "Health"],
        ["history", language === "tr" ? "Tarih" : "History"],
        ["law", language === "tr" ? "Hukuk" : "Law"],
        ["math", language === "tr" ? "Matematik" : "Math"],
        ["philosophy", language === "tr" ? "Felsefe" : "Philosophy"],
        ["physics", language === "tr" ? "Fizik" : "Physics"],
        ["psychology", language === "tr" ? "Psikoloji" : "Psychology"],
        ["other", language === "tr" ? "Diğer" : "Other"],
    ];

    const sweLiveOptions: [string, string][] = [
        ["lite", "Lite"],
        ["full", "Full"],
        ["verified", "Verified"],
        ["ccpp", "C/C++"],
        ["csharp", "C#"],
        ["go", "Go"],
        ["java", "Java"],
        ["rust", "Rust"],
        ["tsjs", "TS/JS"],
        ["windows", "Windows"],
    ];

    const tauOptions: [string, string][] = [
        ["airline", language === "tr" ? "Havayolu" : "Airline"],
        ["retail", language === "tr" ? "Perakende" : "Retail"],
        ["telecom", language === "tr" ? "Telekom" : "Telecom"],
        ["banking_knowledge", language === "tr" ? "Bankacılık" : "Banking"],
    ];

    return (
        <section className="leaderboard-page app-page" id="leaderboard">
            <div className="lb-toolbar-card">
                <div className="lb-benchmark-strip" role="tablist" aria-label={language === "tr" ? "Benchmark seç" : "Select benchmark"}>
                    {tabGroups.map((group, groupIndex) => (
                        <div className="lb-benchmark-cluster" key={group}>
                            {groupIndex > 0 && <span className="lb-benchmark-sep" aria-hidden="true" />}
                            <span className="lb-benchmark-cluster-label">{groupLabels[language][group]}</span>
                            {benchmarkTabs.filter(tab => tab.group === group).map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={view === tab.id}
                                    className={`lb-benchmark-pill${view === tab.id ? " active" : ""}`}
                                    disabled={false}
                                    title={tab.hint[language]}
                                    onClick={() => onViewChange(tab.id)}
                                >
                                    {tab.label[language]}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {board ? (
                <div className="lb-filter-bar">
                    <div className="lb-filter-group" role="group" aria-label={language === "tr" ? "Model açıklığı" : "Model openness"}>
                        <span>{language === "tr" ? "Açıklık" : "Openness"}</span>
                        <div className="lb-filter-pills">
                            {opennessOptions.map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={opennessFilter === value ? "active" : ""}
                                    onClick={() => {
                                        setOpennessFilter(value as "all" | "open_source" | "open_weight" | "proprietary");
                                        setVisibleCount(20);
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {isLive && view === "livebench" && (
                        <div className="lb-filter-group" role="group" aria-label={language === "tr" ? "LiveBench kategorisi" : "LiveBench category"}>
                            <span>{language === "tr" ? "Alt kategori" : "Subcategory"}</span>
                            <div className="lb-filter-pills">
                                {livebenchOptions.map(([value, label]) => (
                                    <button key={value} type="button" className={livebenchCategory === value ? "active" : ""} onClick={() => onLivebenchCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isMmlu && (
                        <div className="lb-filter-group" role="group" aria-label={language === "tr" ? "MMLU-Pro alanı" : "MMLU-Pro domain"}>
                            <span>{language === "tr" ? "Alan" : "Domain"}</span>
                            <div className="lb-filter-pills">
                                {mmluOptions.map(([value, label]) => (
                                    <button key={value} type="button" className={mmluCategory === value ? "active" : ""} onClick={() => onMmluCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isSweLive && (
                        <div className="lb-filter-group" role="group" aria-label={language === "tr" ? "SWE-bench Live bölümü" : "SWE-bench Live segment"}>
                            <span>{language === "tr" ? "Bölüm" : "Segment"}</span>
                            <div className="lb-filter-pills">
                                {sweLiveOptions.map(([value, label]) => (
                                    <button key={value} type="button" className={sweLiveCategory === value ? "active" : ""} onClick={() => onSweLiveCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isTau && (
                        <div className="lb-filter-group" role="group" aria-label={language === "tr" ? "τ-bench alanı" : "τ-bench domain"}>
                            <span>{language === "tr" ? "Alan" : "Domain"}</span>
                            <div className="lb-filter-pills">
                                {tauOptions.map(([value, label]) => (
                                    <button key={value} type="button" className={tauCategory === value ? "active" : ""} onClick={() => onTauCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}

            <div className="lb-summary-grid" aria-label={language === "tr" ? "Benchmark özeti" : "Benchmark summary"}>
                <div className="lb-summary-card">
                    <span>{language === "tr" ? "Listelenen model" : "Models listed"}</span>
                    <strong>{filteredItems.length || "—"} {language === "tr" ? "model" : "models"}</strong>
                </div>
                <div className="lb-summary-card">
                    <span>{language === "tr" ? "En yüksek" : "Top"} {scoreLabel}</span>
                    <strong>{filteredItems[0] ? formatScore(filteredItems[0], isArena, isSwe, isSweLive, isTau, locale) : "—"}</strong>
                </div>
                <div className="lb-summary-card">
                    <span>{language === "tr" ? "Son güncelleme" : "Last updated"}</span>
                    <strong>{board?.published_at ? new Date(board.published_at).toLocaleDateString(locale) : "—"}</strong>
                </div>
            </div>

            <div className="leaderboard-table-shell">
                <div className="lb-table-banner">
                    <div>
                        <h2>{viewTitles[view][language]}</h2>
                        <p>{viewHints[view][language]}</p>
                    </div>
                    <div className="lb-table-actions">
                        <button
                            type="button"
                            className="lb-about-btn"
                            aria-label={language === "tr" ? `${benchmarkInfo[view].name} hakkında bilgi` : `About ${benchmarkInfo[view].name}`}
                            onClick={onOpenInfo}
                        >
                            <span className="lb-info-icon" aria-hidden="true">i</span>
                            {language === "tr" ? "Benchmark bilgisi" : "Benchmark info"}
                        </button>
                        {board?.source.url && (
                            <a className="lb-source-link" href={board.source.url} target="_blank" rel="noreferrer">
                                {language === "tr" ? "Kaynağı aç ↗" : "View source ↗"}
                            </a>
                        )}
                    </div>
                </div>
                <div className="leaderboard-scroll" aria-label={language === "tr" ? "Benchmark sıralama tablosu" : "Benchmark ranking table"}>
                    {!board ? (
                        <div className="leaderboard-empty">{language === "tr" ? "Benchmark yükleniyor…" : "Loading benchmark…"}</div>
                    ) : !allItems.length ? (
                        <div className="leaderboard-empty">{language === "tr" ? "Bu benchmark için henüz veri yok." : "No data yet for this benchmark."}</div>
                    ) : !filteredItems.length ? (
                        <div className="leaderboard-empty">
                            {language === "tr"
                                ? `Bu açıklık filtresinde (${opennessFilter === "open_source" ? "Open Source" : opennessFilter === "open_weight" ? "Open Weight" : "Closed Source"}) eşleşen model yok.`
                                : `No models match this openness filter (${opennessFilter === "open_source" ? "Open Source" : opennessFilter === "open_weight" ? "Open Weight" : "Closed Source"}).`}
                        </div>
                    ) : (
                        <>
                        <table className="leaderboard-table">
                            <thead>
                                <tr>
                                    <th className="lb-col-rank">#</th>
                                    <th className="lb-col-model">Model</th>
                                    <th className="lb-col-score">{scoreLabel}</th>
                                    <th className="lb-col-detail">{language === "tr" ? "Detay" : "Detail"}</th>
                                    <th className="lb-col-action" aria-label={language === "tr" ? "İşlem" : "Action"} />
                                </tr>
                            </thead>
                            <tbody>
                                {visibleItems.map(item => {
                                    const badge = sourceBadge(item.openness, item.license, language);
                                    return (
                                        <tr key={`${item.rank}-${item.model_name}`}>
                                            <td className="lb-col-rank">
                                                <span className={`lb-rank ${rankTone(item.rank)}`}>{item.rank}</span>
                                            </td>
                                            <td className="lb-col-model">
                                                <button type="button" className="lb-model-btn" onClick={() => onInspectModel(item)}>
                                                    <ModelAvatar
                                                        name={item.organization}
                                                        companySlug={organizationSlug(item.organization)}
                                                        companyName={item.organization}
                                                        size="md"
                                                    />
                                                    <span className="lb-model-copy">
                                                        <strong>{item.model_name}</strong>
                                                        <span className="lb-model-meta">{item.organization}<i aria-hidden="true">·</i>{badge.label}</span>
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="lb-col-score">
                                                <div className="lb-score-wrap">
                                                    <strong className="lb-score">{formatScore(item, isArena, isSwe, isSweLive, isTau, locale)}</strong>
                                                    <span className="lb-score-track" aria-hidden="true"><i style={{ width: `${scoreWidth(item.rating)}%` }} /></span>
                                                </div>
                                            </td>
                                            <td className="lb-col-detail lb-muted">
                                                <span>{formatSecondary(item, isArena, isSwe, isSweLive, isTau, isLive, isMmlu, language, locale)}</span>
                                                <small>{formatTertiary(item, isArena, isSwe, isSweLive, language)}</small>
                                            </td>
                                            <td className="lb-col-action">
                                                <button
                                                    type="button"
                                                    className="catalog-link"
                                                    onClick={() => onInspectModel(item)}
                                                    aria-label={language === "tr" ? `${item.model_name} modelini incele` : `Inspect ${item.model_name}`}
                                                >
                                                    {language === "tr" ? "İncele" : "Inspect"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {hasMore && <div ref={sentinelRef} className="lb-scroll-sentinel" aria-hidden="true" />}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

export const LIVEBENCH_VIEW_CATEGORY: Partial<Record<LeaderboardView, string>> = {
    livebench: "overall",
    "livebench-math": "math",
    "livebench-reasoning": "reasoning",
    "livebench-coding": "coding",
};
