"use client";

import { useEffect, useState } from "react";
import ModelAvatar from "./ModelAvatar";
import { useInfiniteScroll } from "../lib/useInfiniteScroll";

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
    label: string;
    hint: string;
    board: keyof Boards;
};

const benchmarkTabs: TabDef[] = [
    { id: "general", group: "Genel", label: "Arena", hint: "İnsan tercihi", board: "general" },
    { id: "intelligence", group: "Genel", label: "AA Zekâ", hint: "Bileşik endeks", board: "intelligence" },
    { id: "coding", group: "Kodlama", label: "SWE-bench", hint: "Verified agent", board: "coding" },
    { id: "swe-live", group: "Kodlama", label: "SWE Live", hint: "Güncel görevler", board: "swe-live" },
    { id: "livecodebench", group: "Kodlama", label: "LiveCodeBench", hint: "Pass@1 kod", board: "livecodebench" },
    { id: "aa-coding", group: "Kodlama", label: "AA Kodlama", hint: "Bileşik endeks", board: "aa-coding" },
    { id: "livebench", group: "Bilgi", label: "LiveBench", hint: "Genel skor", board: "livebench" },
    { id: "livebench-math", group: "Bilgi", label: "LB Math", hint: "Matematik", board: "livebench" },
    { id: "livebench-reasoning", group: "Bilgi", label: "LB Reasoning", hint: "Akıl yürütme", board: "livebench" },
    { id: "livebench-coding", group: "Bilgi", label: "LB Coding", hint: "Kod üretimi", board: "livebench" },
    { id: "mmlu-pro", group: "Bilgi", label: "MMLU-Pro", hint: "Akademik bilgi", board: "mmlu-pro" },
    { id: "agentic", group: "Agent", label: "AA Agentic", hint: "Araç kullanımı", board: "agentic" },
    { id: "tau-bench", group: "Agent", label: "τ-bench", hint: "Pass@1 görev", board: "tau-bench" },
];

const viewTitles: Record<LeaderboardView, string> = {
    general: "İnsan tercihi sıralaması",
    coding: "SWE-bench Verified",
    "swe-live": "SWE-bench Live",
    "tau-bench": "τ-bench araç kullanımı",
    intelligence: "Zekâ endeksi",
    "aa-coding": "Kodlama endeksi",
    agentic: "Agentic endeksi",
    livebench: "LiveBench genel",
    "livebench-math": "LiveBench — Matematik",
    "livebench-reasoning": "LiveBench — Reasoning",
    "livebench-coding": "LiveBench — Kodlama",
    "mmlu-pro": "MMLU-Pro bilgi",
    livecodebench: "LiveCodeBench kod üretimi",
};

const viewHints: Record<LeaderboardView, string> = {
    general: "Arena Rating puanına göre sıralı · oy sayısı ve güven aralığı bağlam bilgisidir",
    coding: "Gerçek GitHub sorunlarında çözülen görev oranı",
    "swe-live": "Güncel yazılım görevlerinde çözüm oranı",
    "tau-bench": "Gerçekçi araç kullanımı görevlerinde Pass@1",
    intelligence: "Artificial Analysis bağımsız zekâ endeksi",
    "aa-coding": "Artificial Analysis kodlama endeksi",
    agentic: "Artificial Analysis agentic görev endeksi",
    livebench: "Kontaminasyonu azaltılmış güncel değerlendirme",
    "livebench-math": "LiveBench matematik alt kategorisi",
    "livebench-reasoning": "LiveBench akıl yürütme alt kategorisi",
    "livebench-coding": "LiveBench kodlama alt kategorisi",
    "mmlu-pro": "14 alanda akademik bilgi testi",
    livecodebench: "Güncel kod problemlerinde Pass@1",
};

const tabGroups = ["Genel", "Kodlama", "Bilgi", "Agent"] as const;

function sourceBadge(
    openness: string | null | undefined,
    license: string | null | undefined,
) {
    const normalized = (openness ?? "").trim().toLowerCase();

    if (normalized === "open_source")
        return { label: "Open Source", description: "Açık kaynak model", kind: "open" };

    if (normalized === "open_weight")
        return { label: "Open Weight", description: "Model ağırlıkları indirilebilir", kind: "open" };

    if (normalized === "proprietary")
        return { label: "Closed Source", description: "Kapalı model / servis erişimi", kind: "closed" };

    const normalizedLicense = (license ?? "").trim().toLowerCase();
    if (normalizedLicense === "not applicable" || normalizedLicense === "n/a")
        return { label: "N/A", description: "Tek bir modele ait olmayan benchmark girdisi", kind: "na" };

    return { label: "?", description: "Açıklık sınıfı henüz doğrulanmadı", kind: "unknown" };
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

function formatScore(item: LeaderboardItem, isArena: boolean, isSwe: boolean, isSweLive: boolean, isTau: boolean) {
    if (isArena) return Math.round(item.rating).toLocaleString("tr-TR");
    if (isSwe || isSweLive || isTau) return `${item.rating.toFixed(1)}%`;
    return item.rating.toFixed(1);
}

function formatSecondary(item: LeaderboardItem, isArena: boolean, isSwe: boolean, isSweLive: boolean, isTau: boolean, isLive: boolean, isMmlu: boolean) {
    if (isArena) return item.vote_count != null ? `${item.vote_count.toLocaleString("tr-TR")} oy` : "—";
    if (isSwe) return String(item.details.evaluation_date ?? "—");
    if (isSweLive) return String(item.details.submission_date ?? "—");
    if (isTau) return String(item.details.benchmark_version ?? "—");
    if (isLive) return String(item.details.release ?? "—");
    if (isMmlu) return String(item.details.evaluation_source ?? "—");
    return String(item.details.benchmark_version ?? "—");
}

function formatTertiary(item: LeaderboardItem, isArena: boolean, isSwe: boolean, isSweLive: boolean) {
    if (isArena && item.rating_lower != null && item.rating_upper != null)
        return `Güven: ${Math.round(item.rating_lower)}–${Math.round(item.rating_upper)}`;
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
    const scoreLabel = isArena ? "Arena Rating" : isSwe || isSweLive ? "Çözüm oranı" : isTau ? "Pass@1" : "Puan";
    const allItems = board?.items ?? [];
    const filteredItems = opennessFilter === "all"
        ? allItems
        : allItems.filter(item => item.openness === opennessFilter);

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

    return (
        <section className="leaderboard-page app-page" id="leaderboard">
            <div className="lb-toolbar-card">
                <div className="lb-benchmark-strip" role="tablist" aria-label="Benchmark seç">
                    {tabGroups.map((group, groupIndex) => (
                        <div className="lb-benchmark-cluster" key={group}>
                            {groupIndex > 0 && <span className="lb-benchmark-sep" aria-hidden="true" />}
                            <span className="lb-benchmark-cluster-label">{group}</span>
                            {benchmarkTabs.filter(tab => tab.group === group).map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={view === tab.id}
                                    className={`lb-benchmark-pill${view === tab.id ? " active" : ""}`}
                                    disabled={false}
                                    title={tab.hint}
                                    onClick={() => onViewChange(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {board ? (
                <div className="lb-filter-bar">
                    <div className="lb-filter-group" role="group" aria-label="Model açıklığı">
                        <span>Açıklık</span>
                        <div className="lb-filter-pills">
                            {([
                                ["all", "Tümü"],
                                ["open_source", "Open Source"],
                                ["open_weight", "Open Weight"],
                                ["proprietary", "Closed Source"],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={opennessFilter === value ? "active" : ""}
                                    onClick={() => {
                                        setOpennessFilter(value);
                                        setVisibleCount(20);
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {isLive && view === "livebench" && (
                        <div className="lb-filter-group" role="group" aria-label="LiveBench kategorisi">
                            <span>Alt kategori</span>
                            <div className="lb-filter-pills">
                                {[["overall", "Genel"], ["reasoning", "Reasoning"], ["math", "Matematik"], ["coding", "Kodlama"], ["data_analysis", "Veri"], ["writing", "Yazma"], ["instruction_following", "Talimat"], ["agentic_coding", "Agentic"]].map(([value, label]) => (
                                    <button key={value} type="button" className={livebenchCategory === value ? "active" : ""} onClick={() => onLivebenchCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isMmlu && (
                        <div className="lb-filter-group" role="group" aria-label="MMLU-Pro alanı">
                            <span>Alan</span>
                            <div className="lb-filter-pills">
                                {[["overall", "Genel"], ["biology", "Biyoloji"], ["business", "İşletme"], ["chemistry", "Kimya"], ["computer_science", "CS"], ["economics", "Ekonomi"], ["engineering", "Müh."], ["health", "Sağlık"], ["history", "Tarih"], ["law", "Hukuk"], ["math", "Matematik"], ["philosophy", "Felsefe"], ["physics", "Fizik"], ["psychology", "Psikoloji"], ["other", "Diğer"]].map(([value, label]) => (
                                    <button key={value} type="button" className={mmluCategory === value ? "active" : ""} onClick={() => onMmluCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isSweLive && (
                        <div className="lb-filter-group" role="group" aria-label="SWE-bench Live bölümü">
                            <span>Bölüm</span>
                            <div className="lb-filter-pills">
                                {[["lite", "Lite"], ["full", "Full"], ["verified", "Verified"], ["ccpp", "C/C++"], ["csharp", "C#"], ["go", "Go"], ["java", "Java"], ["rust", "Rust"], ["tsjs", "TS/JS"], ["windows", "Windows"]].map(([value, label]) => (
                                    <button key={value} type="button" className={sweLiveCategory === value ? "active" : ""} onClick={() => onSweLiveCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isTau && (
                        <div className="lb-filter-group" role="group" aria-label="τ-bench alanı">
                            <span>Alan</span>
                            <div className="lb-filter-pills">
                                {[["airline", "Havayolu"], ["retail", "Perakende"], ["telecom", "Telekom"], ["banking_knowledge", "Bankacılık"]].map(([value, label]) => (
                                    <button key={value} type="button" className={tauCategory === value ? "active" : ""} onClick={() => onTauCategoryChange(value)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}

            <div className="lb-summary-grid" aria-label="Benchmark özeti">
                <div className="lb-summary-card">
                    <span>Listelenen model</span>
                    <strong>{allItems.length || "—"} model</strong>
                </div>
                <div className="lb-summary-card">
                    <span>En yüksek {scoreLabel}</span>
                    <strong>{board?.items[0] ? formatScore(board.items[0], isArena, isSwe, isSweLive, isTau) : "—"}</strong>
                </div>
                <div className="lb-summary-card">
                    <span>Son güncelleme</span>
                    <strong>{board?.published_at ? new Date(board.published_at).toLocaleDateString("tr-TR") : "—"}</strong>
                </div>
            </div>

            <div className="leaderboard-table-shell">
                <div className="lb-table-banner">
                    <div>
                        <h2>{viewTitles[view]}</h2>
                        <p>{viewHints[view]}</p>
                    </div>
                    <div className="lb-table-actions">
                        <button
                            type="button"
                            className="lb-about-btn"
                            aria-label={`${benchmarkInfo[view].name} hakkında bilgi`}
                            onClick={onOpenInfo}
                        >
                            <span className="lb-info-icon" aria-hidden="true">i</span>
                            Benchmark bilgisi
                        </button>
                        {board?.source.url && (
                            <a className="lb-source-link" href={board.source.url} target="_blank" rel="noreferrer">
                                Kaynağı aç ↗
                            </a>
                        )}
                    </div>
                </div>
                <div className="leaderboard-scroll" aria-label="Benchmark sıralama tablosu">
                    {!board ? (
                        <div className="leaderboard-empty">Benchmark yükleniyor…</div>
                    ) : !allItems.length ? (
                        <div className="leaderboard-empty">Bu benchmark için henüz veri yok.</div>
                    ) : (
                        <>
                        <table className="leaderboard-table">
                            <thead>
                                <tr>
                                    <th className="lb-col-rank">#</th>
                                    <th className="lb-col-model">Model</th>
                                    <th className="lb-col-score">{scoreLabel}</th>
                                    <th className="lb-col-detail">Detay</th>
                                    <th className="lb-col-action" aria-label="İşlem" />
                                </tr>
                            </thead>
                            <tbody>
                                {visibleItems.map(item => {
                                    const badge = sourceBadge(item.openness, item.license);
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
                                                    <strong className="lb-score">{formatScore(item, isArena, isSwe, isSweLive, isTau)}</strong>
                                                    <span className="lb-score-track" aria-hidden="true"><i style={{ width: `${scoreWidth(item.rating)}%` }} /></span>
                                                </div>
                                            </td>
                                            <td className="lb-col-detail lb-muted">
                                                <span>{formatSecondary(item, isArena, isSwe, isSweLive, isTau, isLive, isMmlu)}</span>
                                                <small>{formatTertiary(item, isArena, isSwe, isSweLive)}</small>
                                            </td>
                                            <td className="lb-col-action">
                                                <button
                                                    type="button"
                                                    className="catalog-link"
                                                    onClick={() => onInspectModel(item)}
                                                    aria-label={`${item.model_name} modelini incele`}
                                                >
                                                    İncele
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
