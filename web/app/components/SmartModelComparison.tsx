"use client";

import type { CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ModelAvatar from "./ModelAvatar";
import { useLanguage } from "../lib/i18n";
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
    if (value === "Var" || value === "Yes")
        return <span className="cmp-badge cmp-badge-yes">{value}</span>;
    if (value === "Yok" || value === "No")
        return <span className="cmp-badge cmp-badge-no">{value}</span>;
    if (value === "Bilinmiyor" || value === "Unknown")
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
    const { language } = useLanguage();
    const t = language === "tr"
        ? {
            radarAria: "Radar grafiği",
            radarKicker: "RADAR",
            radarTitle: "Çok boyutlu profil",
            priceAria: "Fiyat grafiği",
            priceKicker: "USD / 1M",
            priceTitle: "Token fiyatı",
            contextAria: "Context grafiği",
            contextKicker: "K TOKEN",
            contextTitle: "Context kapasitesi",
            input: "Girdi",
            output: "Çıktı",
            cached: "Cached",
            contextK: "Context (K)",
            metricContext: "Context",
            metricInput: "Girdi",
            metricOutput: "Çıktı",
            metricModality: "Modalite",
            metricTool: "Tool",
            metricReasoning: "Reasoning",
            metricBenchmark: "Benchmark",
        }
        : {
            radarAria: "Radar chart",
            radarKicker: "RADAR",
            radarTitle: "Multi-dimensional profile",
            priceAria: "Price chart",
            priceKicker: "USD / 1M",
            priceTitle: "Token price",
            contextAria: "Context chart",
            contextKicker: "K TOKENS",
            contextTitle: "Context capacity",
            input: "Input",
            output: "Output",
            cached: "Cached",
            contextK: "Context (K)",
            metricContext: "Context",
            metricInput: "Input",
            metricOutput: "Output",
            metricModality: "Modality",
            metricTool: "Tool",
            metricReasoning: "Reasoning",
            metricBenchmark: "Benchmark",
        };
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
        { metric: t.metricContext, score: (entry: typeof entries[number]) => Math.round(((entry.context ?? 0) / maxContext) * 100) },
        { metric: t.metricInput, score: (entry: typeof entries[number]) => priceAdvantage(entry.input, "input") },
        { metric: t.metricOutput, score: (entry: typeof entries[number]) => priceAdvantage(entry.output, "output") },
        { metric: t.metricModality, score: (entry: typeof entries[number]) => Math.min(100, entry.modalityCount * 25) },
        { metric: t.metricTool, score: (entry: typeof entries[number]) => entry.toolCalling === true ? 100 : 0 },
        { metric: t.metricReasoning, score: (entry: typeof entries[number]) => entry.reasoning === true ? 100 : 0 },
        { metric: t.metricBenchmark, score: (entry: typeof entries[number]) => {
            const model = models.find(item => item.id === entry.id);
            return model?.selection?.benchmark_score ?? 0;
        } },
    ];
    const radarData: Array<Record<string, string | number>> = metrics.map(item => {
        const row: Record<string, string | number> = { metric: item.metric };
        entries.forEach(entry => { row[entry.id] = item.score(entry); });
        return row;
    });
    const priceData = entries.map(entry => ({ name: entry.name, input: entry.input, output: entry.output, cached: entry.cached }));
    const contextData = entries.map(entry => ({ name: entry.name, contextK: entry.context == null ? null : Math.round((entry.context / 1024) * 10) / 10 }));
    return (
        <div className="cmp-chart-grid">
            <article className="cmp-chart cmp-chart-radar" role="img" aria-label={t.radarAria}>
                <header><p>{t.radarTitle}</p><span>{t.radarKicker}</span></header>
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
            <article className="cmp-chart" role="img" aria-label={t.priceAria}>
                <header><p>{t.priceTitle}</p><span>{t.priceKicker}</span></header>
                <div className="cmp-chart-body">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={priceData} margin={{ top: 8, right: 4, left: -20, bottom: 16 }}>
                            <CartesianGrid stroke="#3a4a44" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: "#9eaea4", fontSize: 9 }} interval={0} angle={-10} textAnchor="end" />
                            <YAxis tick={{ fill: "#7a8a82", fontSize: 9 }} />
                            <Tooltip contentStyle={{ background: "#1a2420", border: "1px solid #3a4a44", borderRadius: 8 }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="input" name={t.input} fill="#3d8f84" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="output" name={t.output} fill="#8b72c4" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="cached" name={t.cached} fill="#8cb43a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </article>
            <article className="cmp-chart" role="img" aria-label={t.contextAria}>
                <header><p>{t.contextTitle}</p><span>{t.contextKicker}</span></header>
                <div className="cmp-chart-body">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={contextData} margin={{ top: 8, right: 4, left: -20, bottom: 16 }}>
                            <CartesianGrid stroke="#3a4a44" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: "#9eaea4", fontSize: 9 }} interval={0} angle={-10} textAnchor="end" />
                            <YAxis tick={{ fill: "#7a8a82", fontSize: 9 }} />
                            <Tooltip contentStyle={{ background: "#1a2420", border: "1px solid #3a4a44", borderRadius: 8 }} />
                            <Bar dataKey="contextK" name={t.contextK} fill="#8cb43a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </article>
        </div>
    );
}

export default function SmartModelComparison({ models, profiles, developerSites = {}, onRemove, onInspect }: Props) {
    const { language, locale } = useLanguage();
    const snapshots = models.map(model => buildSnapshot(
        model,
        profiles[model.id]?.features,
        profiles[model.id]?.selection,
    ));
    const scenarios = buildScenarioPicks(snapshots, language);
    const insights = buildInsights(snapshots, language, locale);
    const matrix = buildDimensionMatrix(snapshots, language, locale);

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
                                aria-label={language === "tr" ? `${model.name} modelini karşılaştırmadan çıkar` : `Remove ${model.name} from comparison`}
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
                            <span>{snapshots[index]?.inputPrice != null ? `$${snapshots[index].inputPrice}` : "—"} {language === "tr" ? "girdi" : "input"}</span>
                        </div>
                        {onInspect && (
                            <button type="button" className="cmp-hero-detail" onClick={() => onInspect(model)}>
                                {language === "tr" ? "Tüm ayrıntılar" : "All details"}
                            </button>
                        )}
                    </article>
                ))}
            </div>

            <section className="cmp-panel" aria-labelledby="compare-charts-title">
                <header className="cmp-panel-head">
                    <div>
                        <p className="kicker">{language === "tr" ? "GRAFİKLER" : "CHARTS"}</p>
                        <h3 id="compare-charts-title">{language === "tr" ? "Görsel karşılaştırma" : "Visual comparison"}</h3>
                    </div>
                </header>
                <ComparisonCharts models={models} profiles={profiles} developerSites={developerSites} />
            </section>

            <section className="cmp-panel" aria-labelledby="compare-insights-title">
                <header className="cmp-panel-head">
                    <div>
                        <p className="kicker">{language === "tr" ? "AKILLI ÖZET" : "SMART SUMMARY"}</p>
                        <h3 id="compare-insights-title">{language === "tr" ? "Avantaj & dezavantaj" : "Pros & cons"}</h3>
                    </div>
                    <p>{language === "tr" ? "Rakiplere göre otomatik çıkarılan güçlü ve zayıf yönler." : "Strengths and weaknesses automatically derived relative to the competition."}</p>
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
                                    <span className="cmp-insight-label cmp-insight-label-pro">{language === "tr" ? "+ Avantajlar" : "+ Pros"}</span>
                                    <div className="cmp-tag-list">
                                        {item.pros.length
                                            ? item.pros.map(point => <span key={point} className="cmp-tag cmp-tag-pro">{point}</span>)
                                            : <span className="cmp-tag cmp-tag-empty">{language === "tr" ? "Belirgin avantaj yok" : "No clear advantage"}</span>}
                                    </div>
                                </div>
                                <div>
                                    <span className="cmp-insight-label cmp-insight-label-con">{language === "tr" ? "− Dezavantajlar" : "− Cons"}</span>
                                    <div className="cmp-tag-list">
                                        {item.cons.length
                                            ? item.cons.map(point => <span key={point} className="cmp-tag cmp-tag-con">{point}</span>)
                                            : <span className="cmp-tag cmp-tag-empty">{language === "tr" ? "Belirgin dezavantaj yok" : "No clear disadvantage"}</span>}
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
                        <p className="kicker">{language === "tr" ? "SENARYO ÖNERİSİ" : "SCENARIO SUGGESTIONS"}</p>
                        <h3 id="compare-scenarios-title">{language === "tr" ? "Hangi iş için hangi model?" : "Which model for which job?"}</h3>
                    </div>
                    <p>{language === "tr" ? "8 kullanım senaryosu için ağırlıklı skor." : "Weighted score across 8 use-case scenarios."}</p>
                </header>
                <div className="cmp-scenario-grid">
                    {scenarios.map(item => {
                        const winnerIndex = models.findIndex(model => model.id === item.winnerId);
                        return (
                            <article key={item.id} className={item.winnerId ? "cmp-scenario-card is-winner" : "cmp-scenario-card"} style={winnerIndex >= 0 ? { "--cmp-accent": MODEL_ACCENTS[winnerIndex] } as CSSProperties : undefined}>
                                <div className="cmp-scenario-icon" aria-hidden="true">{SCENARIO_ICONS[item.id] ?? "•"}</div>
                                <div className="cmp-scenario-main">
                                    <p>{SCENARIO_LABELS[language][item.id] ?? item.label}</p>
                                    <strong>{item.winnerName ?? (language === "tr" ? "Yetersiz veri" : "Insufficient data")}</strong>
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
                        <p className="kicker">{language === "tr" ? "BOYUT MATRİSİ" : "DIMENSION MATRIX"}</p>
                        <h3 id="compare-matrix-title">{language === "tr" ? "Tüm ölçütler" : "All metrics"}</h3>
                    </div>
                    <p>{language === "tr" ? "Fiyat, context, benchmark ve yetenekler." : "Price, context, benchmark, and capabilities."}</p>
                </header>
                <div className="cmp-matrix" style={{ "--cmp-cols": models.length } as CSSProperties}>
                    <div className="cmp-matrix-head">
                        <span>{language === "tr" ? "Ölçüt" : "Metric"}</span>
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
                                        {isWinner && <em className="cmp-win-mark" aria-label={language === "tr" ? "Bu ölçütte öne çıkan" : "Leader on this metric"}>★</em>}
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
