"use client";

import type { CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ModelAvatar from "./ModelAvatar";
import {
    buildDimensionMatrix,
    buildInsights,
    buildScenarioPicks,
    buildSnapshot,
    isBoolMatrixValue,
    SCENARIO_LABELS,
    type CompareFeatures,
    type CompareModelInput,
    type CompareSelection,
} from "../lib/modelComparison";

const MODEL_ACCENTS = ["#6e961a", "#3d8f84", "#8b72c4"];
const chartColors = ["#8cb43a", "#3d8f84", "#8b72c4"];

const SCENARIO_ICONS: Record<string, string> = {
    chat: "◎",
    coding: "{ }",
    long_document: "▤",
    agent: "⚙",
    vision: "◉",
    local: "⌂",
    high_volume: "▥",
    low_latency: "⚡",
};

function chartName(name: string) {
    return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}

function numeric(value: string | null | undefined) {
    if (value == null || value === "")
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatBoolBadge(value: string) {
    if (value === "Var")
        return <span className="cmp-badge cmp-badge-yes">Var</span>;
    if (value === "Yok")
        return <span className="cmp-badge cmp-badge-no">Yok</span>;
    if (value === "Bilinmiyor")
        return <span className="cmp-badge cmp-badge-na">?</span>;
    return value;
}

type Props = {
    models: CompareModelInput[];
    profiles: Record<string, { features: CompareFeatures; selection?: CompareSelection | null }>;
    developerSites?: Record<string, string | null | undefined>;
    onRemove?: (model: CompareModelInput) => void;
    onInspect?: (model: CompareModelInput) => void;
};

function ComparisonCharts({ models, profiles }: Props) {
    const entries = models.map(model => {
        const features = profiles[model.id]?.features;
        const modalities = features?.modalities?.length ? features.modalities : (model.capabilities.input_modalities ?? []);
        return {
            id: model.id,
            name: chartName(model.name),
            context: features?.context_window ?? model.context_window,
            input: numeric(features?.input_price ?? model.pricing?.input),
            output: numeric(features?.output_price ?? model.pricing?.output),
            cached: numeric(features?.cache_read_price ?? model.pricing?.cache_read),
            modalityCount: new Set(modalities.map(item => item.toLowerCase())).size,
            toolCalling: features?.tool_calling ?? model.profile?.tool_calling ?? null,
            reasoning: features?.reasoning ?? model.profile?.reasoning ?? null,
        };
    });
    const maxContext = Math.max(1, ...entries.map(entry => entry.context ?? 0));
    const priceAdvantage = (value: number | null, kind: "input" | "output") => {
        if (value == null)
            return 0;
        const values = entries.map(entry => entry[kind]).filter((item): item is number => item != null);
        if (values.length <= 1)
            return 100;
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (max === min)
            return 100;
        return Math.round(20 + ((max - value) / (max - min)) * 80);
    };
    const metrics = [
        { metric: "Context", score: (entry: typeof entries[number]) => Math.round(((entry.context ?? 0) / maxContext) * 100) },
        { metric: "Girdi", score: (entry: typeof entries[number]) => priceAdvantage(entry.input, "input") },
        { metric: "Çıktı", score: (entry: typeof entries[number]) => priceAdvantage(entry.output, "output") },
        { metric: "Modalite", score: (entry: typeof entries[number]) => Math.min(100, entry.modalityCount * 25) },
        { metric: "Tool", score: (entry: typeof entries[number]) => entry.toolCalling === true ? 100 : 0 },
        { metric: "Reasoning", score: (entry: typeof entries[number]) => entry.reasoning === true ? 100 : 0 },
        { metric: "Benchmark", score: (entry: typeof entries[number]) => {
            const model = models.find(item => item.id === entry.id);
            return model?.selection?.benchmark_score ?? 0;
        } },
    ];
    const radarData: Array<Record<string, string | number>> = metrics.map(item => {
        const row: Record<string, string | number> = { metric: item.metric };
        entries.forEach(entry => { row[entry.id] = item.score(entry); });
        return row;
    });
    const priceData = entries.map(entry => ({ name: entry.name, Girdi: entry.input, "Çıktı": entry.output, "Cached": entry.cached }));
    const contextData = entries.map(entry => ({ name: entry.name, "Context (K)": entry.context == null ? null : Math.round((entry.context / 1024) * 10) / 10 }));
    return (
        <div className="cmp-chart-grid">
            <article className="cmp-chart cmp-chart-radar" role="img" aria-label="Radar grafiği">
                <header><p>Çok boyutlu profil</p><span>RADAR</span></header>
                <div className="cmp-chart-body cmp-chart-body-tall">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} outerRadius="68%">
                            <PolarGrid stroke="#3a4a44" />
                            <PolarAngleAxis dataKey="metric" tick={{ fill: "#c8d4ce", fontSize: 10, fontWeight: 700 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#7a8a82", fontSize: 9 }} axisLine={false} />
                            <Tooltip contentStyle={{ background: "#1a2420", border: "1px solid #3a4a44", borderRadius: 8, color: "#edf3eb" }} />
                            <Legend wrapperStyle={{ fontSize: 11, color: "#c8d4ce" }} />
                            {entries.map((entry, index) => (
                                <Radar key={entry.id} name={entry.name} dataKey={entry.id} stroke={chartColors[index]} fill={chartColors[index]} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
                            ))}
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </article>
            <article className="cmp-chart" role="img" aria-label="Fiyat grafiği">
                <header><p>Token fiyatı</p><span>USD / 1M</span></header>
                <div className="cmp-chart-body">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={priceData} margin={{ top: 8, right: 4, left: -20, bottom: 16 }}>
                            <CartesianGrid stroke="#3a4a44" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: "#9eaea4", fontSize: 9 }} interval={0} angle={-10} textAnchor="end" />
                            <YAxis tick={{ fill: "#7a8a82", fontSize: 9 }} />
                            <Tooltip contentStyle={{ background: "#1a2420", border: "1px solid #3a4a44", borderRadius: 8 }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="Girdi" fill="#3d8f84" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="Çıktı" fill="#8b72c4" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="Cached" fill="#8cb43a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </article>
            <article className="cmp-chart" role="img" aria-label="Context grafiği">
                <header><p>Context kapasitesi</p><span>K TOKEN</span></header>
                <div className="cmp-chart-body">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={contextData} margin={{ top: 8, right: 4, left: -20, bottom: 16 }}>
                            <CartesianGrid stroke="#3a4a44" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: "#9eaea4", fontSize: 9 }} interval={0} angle={-10} textAnchor="end" />
                            <YAxis tick={{ fill: "#7a8a82", fontSize: 9 }} />
                            <Tooltip contentStyle={{ background: "#1a2420", border: "1px solid #3a4a44", borderRadius: 8 }} />
                            <Bar dataKey="Context (K)" fill="#8cb43a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </article>
        </div>
    );
}

export default function SmartModelComparison({ models, profiles, developerSites = {}, onRemove, onInspect }: Props) {
    const snapshots = models.map(model => buildSnapshot(
        model,
        profiles[model.id]?.features,
        profiles[model.id]?.selection,
    ));
    const scenarios = buildScenarioPicks(snapshots);
    const insights = buildInsights(snapshots);
    const matrix = buildDimensionMatrix(snapshots);

    return (
        <div className="smart-compare">
            <div className="cmp-hero-strip">
                {models.map((model, index) => (
                    <article key={model.id} className="cmp-hero-card" style={{ "--cmp-accent": MODEL_ACCENTS[index] } as CSSProperties}>
                        <span className="cmp-hero-accent" aria-hidden="true" />
                        {onRemove && (
                            <button
                                type="button"
                                className="cmp-hero-remove"
                                onClick={() => onRemove(model)}
                                aria-label={`${model.name} modelini karşılaştırmadan çıkar`}
                            >
                                ×
                            </button>
                        )}
                        <div className="cmp-hero-top">
                            <ModelAvatar
                                name={model.name}
                                companySlug={model.company.slug}
                                companyName={model.company.name}
                                websiteUrl={developerSites[model.company.slug]}
                                size="md"
                            />
                        </div>
                        <p className="cmp-hero-company"><span className="cmp-hero-index">#{index + 1}</span>{model.company.name}</p>
                        <h3 className="cmp-hero-name">{model.name}</h3>
                        <div className="cmp-hero-stats">
                            <span>{snapshots[index]?.context ? `${(snapshots[index].context! / 1000).toFixed(0)}K ctx` : "— ctx"}</span>
                            <span>{snapshots[index]?.inputPrice != null ? `$${snapshots[index].inputPrice}` : "—"} girdi</span>
                        </div>
                        {onInspect && (
                            <button type="button" className="cmp-hero-detail" onClick={() => onInspect(model)}>
                                Tüm ayrıntılar
                            </button>
                        )}
                    </article>
                ))}
            </div>

            <section className="cmp-panel" aria-labelledby="compare-charts-title">
                <header className="cmp-panel-head">
                    <div>
                        <p className="kicker">GRAFİKLER</p>
                        <h3 id="compare-charts-title">Görsel karşılaştırma</h3>
                    </div>
                </header>
                <ComparisonCharts models={models} profiles={profiles} developerSites={developerSites} />
            </section>

            <section className="cmp-panel" aria-labelledby="compare-insights-title">
                <header className="cmp-panel-head">
                    <div>
                        <p className="kicker">AKILLI ÖZET</p>
                        <h3 id="compare-insights-title">Avantaj & dezavantaj</h3>
                    </div>
                    <p>Rakiplere göre otomatik çıkarılan güçlü ve zayıf yönler.</p>
                </header>
                <div className="cmp-insight-grid">
                    {insights.map((item, index) => (
                        <article key={item.id} className="cmp-insight-card" style={{ "--cmp-accent": MODEL_ACCENTS[index] } as CSSProperties}>
                            <header>
                                <span className="cmp-insight-dot" aria-hidden="true" />
                                <h4>{item.name}</h4>
                            </header>
                            <div className="cmp-insight-body">
                                <div>
                                    <span className="cmp-insight-label cmp-insight-label-pro">+ Avantajlar</span>
                                    <div className="cmp-tag-list">
                                        {item.pros.length
                                            ? item.pros.map(point => <span key={point} className="cmp-tag cmp-tag-pro">{point}</span>)
                                            : <span className="cmp-tag cmp-tag-empty">Belirgin avantaj yok</span>}
                                    </div>
                                </div>
                                <div>
                                    <span className="cmp-insight-label cmp-insight-label-con">− Dezavantajlar</span>
                                    <div className="cmp-tag-list">
                                        {item.cons.length
                                            ? item.cons.map(point => <span key={point} className="cmp-tag cmp-tag-con">{point}</span>)
                                            : <span className="cmp-tag cmp-tag-empty">Belirgin dezavantaj yok</span>}
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="cmp-panel" aria-labelledby="compare-scenarios-title">
                <header className="cmp-panel-head">
                    <div>
                        <p className="kicker">SENARYO ÖNERİSİ</p>
                        <h3 id="compare-scenarios-title">Hangi iş için hangi model?</h3>
                    </div>
                    <p>8 kullanım senaryosu için ağırlıklı skor.</p>
                </header>
                <div className="cmp-scenario-grid">
                    {scenarios.map(item => {
                        const winnerIndex = models.findIndex(model => model.id === item.winnerId);
                        return (
                            <article key={item.id} className={item.winnerId ? "cmp-scenario-card is-winner" : "cmp-scenario-card"} style={winnerIndex >= 0 ? { "--cmp-accent": MODEL_ACCENTS[winnerIndex] } as CSSProperties : undefined}>
                                <div className="cmp-scenario-icon" aria-hidden="true">{SCENARIO_ICONS[item.id] ?? "•"}</div>
                                <div className="cmp-scenario-main">
                                    <p>{SCENARIO_LABELS[item.id] ?? item.label}</p>
                                    <strong>{item.winnerName ?? "Yetersiz veri"}</strong>
                                    <small>{item.reason}</small>
                                </div>
                                {item.scores.some(score => score.score != null) && (
                                    <div className="cmp-scenario-scores">
                                        {item.scores.filter(score => score.score != null).map(score => {
                                            const scoreIndex = models.findIndex(model => model.id === score.id);
                                            return (
                                                <span key={score.id} className={score.id === item.winnerId ? "cmp-score-chip is-top" : "cmp-score-chip"} style={scoreIndex >= 0 ? { "--cmp-accent": MODEL_ACCENTS[scoreIndex] } as CSSProperties : undefined}>
                                                    <i>{chartName(score.name)}</i>
                                                    <b>{score.score}</b>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="cmp-panel" aria-labelledby="compare-matrix-title">
                <header className="cmp-panel-head">
                    <div>
                        <p className="kicker">BOYUT MATRİSİ</p>
                        <h3 id="compare-matrix-title">Tüm ölçütler</h3>
                    </div>
                    <p>Fiyat, context, benchmark ve yetenekler.</p>
                </header>
                <div className="cmp-matrix" style={{ "--cmp-cols": models.length } as CSSProperties}>
                    <div className="cmp-matrix-head">
                        <span>Ölçüt</span>
                        {models.map((model, index) => (
                            <span key={model.id} className="cmp-matrix-model" style={{ "--cmp-accent": MODEL_ACCENTS[index] } as CSSProperties}>
                                <ModelAvatar name={model.name} companySlug={model.company.slug} companyName={model.company.name} websiteUrl={developerSites[model.company.slug]} size="sm" />
                                {chartName(model.name)}
                            </span>
                        ))}
                    </div>
                    {matrix.map(row => (
                        <div key={row.id} className="cmp-matrix-row">
                            <span className="cmp-matrix-label">{row.label}</span>
                            {models.map((model, index) => {
                                const raw = row.values[model.id];
                                const isWinner = row.winnerId === model.id;
                                const isBool = isBoolMatrixValue(row.id, raw);
                                return (
                                    <span key={model.id} className={isWinner ? "cmp-matrix-value is-winner" : "cmp-matrix-value"} style={{ "--cmp-accent": MODEL_ACCENTS[index] } as CSSProperties}>
                                        {isBool ? formatBoolBadge(raw) : raw}
                                        {isWinner && <em className="cmp-win-mark" aria-label="Bu ölçütte öne çıkan">★</em>}
                                    </span>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
