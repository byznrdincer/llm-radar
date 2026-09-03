import type { Language } from "./i18n";

export type CompareFeatures = {
    context_window: number | null;
    input_price: string | null;
    output_price: string | null;
    cache_read_price: string | null;
    modalities: string[];
    tool_calling: boolean | null;
    reasoning: boolean | null;
    availability: string | null;
    openness?: string | null;
    license: string | null;
    license_raw?: string | null;
    commercial_use_status?: string | null;
};

export type CompareModelInput = {
    id: string;
    name: string;
    company: { slug: string; name: string };
    context_window: number | null;
    pricing: { input: string | null; output: string | null; cache_read?: string | null } | null;
    capabilities: { input_modalities?: string[] };
    profile?: {
        tool_calling: boolean | null;
        reasoning: boolean | null;
        availability?: string | null;
        openness?: string | null;
        license: string | null;
        commercial_use_status?: string | null;
    };
    selection?: {
        benchmark_score: number;
        best_rank: number;
    } | null;
};

export type ModelSnapshot = {
    id: string;
    name: string;
    company: string;
    context: number | null;
    inputPrice: number | null;
    outputPrice: number | null;
    cachePrice: number | null;
    modalities: string[];
    modalityCount: number;
    hasVision: boolean;
    toolCalling: boolean | null;
    reasoning: boolean | null;
    benchmarkScore: number | null;
    bestRank: number | null;
    openness: string | null;
    license: string | null;
    availability: string | null;
};

export type DimensionRow = {
    id: string;
    label: string;
    values: Record<string, string>;
    winnerId: string | null;
    note?: string;
};

export type ScenarioPick = {
    id: string;
    label: string;
    winnerId: string | null;
    winnerName: string | null;
    reason: string;
    scores: { id: string; name: string; score: number | null }[];
};

export type ModelInsight = {
    id: string;
    name: string;
    pros: string[];
    cons: string[];
};

const VALUE_SCENARIOS: Record<string, Record<string, number>> = {
    chat: { quality: 0.35, input_price: 0.15, output_price: 0.15, cache: 0.05, context: 0.1 },
    coding: { quality: 0.4, input_price: 0.1, output_price: 0.15, cache: 0.05, context: 0.05, tool_use: 0.15 },
    long_document: { quality: 0.3, input_price: 0.15, output_price: 0.1, cache: 0.15, context: 0.25 },
    agent: { quality: 0.3, input_price: 0.1, output_price: 0.15, context: 0.05, tool_use: 0.2, reasoning: 0.1 },
    vision: { quality: 0.35, input_price: 0.15, output_price: 0.1, modality: 0.25, context: 0.05 },
    local: { quality: 0.3, license: 0.2, context: 0.15, open_weight: 0.2 },
    high_volume: { quality: 0.2, input_price: 0.25, output_price: 0.25, cache: 0.2, context: 0.05 },
    low_latency: { quality: 0.25, input_price: 0.2, output_price: 0.15, context: 0.1 },
};

export const SCENARIO_LABELS: Record<Language, Record<string, string>> = {
    tr: {
        chat: "Genel sohbet",
        coding: "Kodlama",
        long_document: "Uzun belge",
        agent: "Agent / araç kullanımı",
        vision: "Görsel & multimodal",
        local: "Yerel / açık kaynak",
        high_volume: "Yüksek hacim",
        low_latency: "Maliyet odaklı hızlı yanıt",
    },
    en: {
        chat: "General chat",
        coding: "Coding",
        long_document: "Long documents",
        agent: "Agent / tool use",
        vision: "Vision & multimodal",
        local: "Local / open source",
        high_volume: "High volume",
        low_latency: "Cost-focused fast response",
    },
};

const ACCESS_LABELS: Record<Language, Record<string, string>> = {
    tr: {
        open_source: "Open Source",
        open_weight: "Open Weight",
        proprietary: "Closed Source",
        unknown: "Bilinmiyor",
    },
    en: {
        open_source: "Open Source",
        open_weight: "Open Weight",
        proprietary: "Closed Source",
        unknown: "Unknown",
    },
};

function formatAccessLabel(value: string | null | undefined, language: Language): string {
    if (!value)
        return language === "tr" ? "Bilinmiyor" : "Unknown";
    const normalized = value.trim().toLowerCase().replace(/-/g, "_");
    return ACCESS_LABELS[language][normalized] ?? value.replaceAll("_", " ");
}

function formatLicenseLabel(value: string | null | undefined, language: Language): string {
    if (!value)
        return language === "tr" ? "Bilinmiyor" : "Unknown";
    const normalized = value.trim();
    if (normalized.toLowerCase() === "proprietary")
        return language === "tr" ? "Kapalı kaynak" : "Closed source";
    return normalized;
}

function resolveAvailability(features?: CompareFeatures | null, model?: CompareModelInput): string | null {
    return features?.availability
        ?? model?.profile?.availability
        ?? features?.openness
        ?? model?.profile?.openness
        ?? null;
}

function resolveLicense(features?: CompareFeatures | null, model?: CompareModelInput): string | null {
    return features?.license
        ?? model?.profile?.license
        ?? features?.license_raw
        ?? null;
}

function inferLicenseFromModel(model: CompareModelInput): string | null {
    const name = model.name.toLowerCase();
    const org = model.company.name.toLowerCase();
    const slug = model.company.slug.toLowerCase();
    const proprietarySignals = [
        () => slug.includes("anthropic") || org.includes("anthropic") || name.includes("claude"),
        () => slug.includes("openai") || org.includes("openai") || name.includes("gpt") || /^o[134]/.test(name),
        () => slug.includes("google") || org.includes("google") || name.includes("gemini"),
        () => slug.includes("amazon") || org.includes("amazon") || name.includes("nova"),
        () => slug.includes("xai") || name.includes("grok"),
        () => slug.includes("cohere") || name.includes("command"),
        () => slug.includes("perplexity"),
        () => name.includes("haiku") || name.includes("sonnet") || name.includes("opus"),
    ];
    if (proprietarySignals.some(check => check()))
        return "Proprietary";
    if (name.includes("gpt-oss") || name.includes("llama") || name.includes("mistral") || name.includes("mixtral"))
        return "Open";
    if (name.includes("qwen") || name.includes("deepseek"))
        return "Open";
    return null;
}

function inferAvailabilityFromLicense(license: string | null): string | null {
    if (!license)
        return null;
    if (license.toLowerCase() === "proprietary" || license.toLowerCase() === "kapalı kaynak" || license.toLowerCase() === "closed source")
        return "proprietary";
    return "open_weight";
}

function parseNum(value: string | null | undefined): number | null {
    if (value == null || value === "")
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function hasVisionModalities(modalities: string[]): boolean {
    return modalities.some(item => /image|vision|video|audio/i.test(item));
}

function opennessScore(value: string | null | undefined): number | null {
    if (!value)
        return null;
    if (value === "open_source")
        return 100;
    if (value === "open_weight")
        return 85;
    if (value === "proprietary")
        return 20;
    return null;
}

function boolScore(value: boolean | null): number | null {
    if (value == null)
        return null;
    return value ? 100 : 0;
}

function priceScore(value: number | null): number | null {
    if (value == null)
        return null;
    return Math.max(0, 100 - value);
}

function contextScore(value: number | null): number | null {
    if (value == null)
        return null;
    return Math.min(100, value / 2000);
}

function inferOpennessFromLicense(license: string | null): string | null {
    return inferAvailabilityFromLicense(license);
}

export type CompareSelection = {
    benchmark_score: number;
    best_rank: number;
};

export function buildSnapshot(
    model: CompareModelInput,
    features?: CompareFeatures | null,
    selection?: CompareSelection | null,
): ModelSnapshot {
    const modalities = features?.modalities?.length
        ? features.modalities
        : (model.capabilities.input_modalities ?? []);
    const licenseRaw = resolveLicense(features, model) ?? inferLicenseFromModel(model);
    const availabilityRaw = resolveAvailability(features, model)
        ?? inferAvailabilityFromLicense(licenseRaw);
    const openness = features?.openness
        ?? model.profile?.openness
        ?? availabilityRaw
        ?? inferOpennessFromLicense(licenseRaw);
    return {
        id: model.id,
        name: model.name,
        company: model.company.name,
        context: features?.context_window ?? model.context_window,
        inputPrice: parseNum(features?.input_price ?? model.pricing?.input),
        outputPrice: parseNum(features?.output_price ?? model.pricing?.output),
        cachePrice: parseNum(features?.cache_read_price ?? model.pricing?.cache_read),
        modalities,
        modalityCount: new Set(modalities.map(item => item.toLowerCase())).size,
        hasVision: hasVisionModalities(modalities),
        toolCalling: features?.tool_calling ?? model.profile?.tool_calling ?? null,
        reasoning: features?.reasoning ?? model.profile?.reasoning ?? null,
        benchmarkScore: selection?.benchmark_score ?? model.selection?.benchmark_score ?? null,
        bestRank: selection?.best_rank ?? model.selection?.best_rank ?? null,
        openness,
        license: licenseRaw,
        availability: availabilityRaw,
    };
}

function valueScore(snapshot: ModelSnapshot, scenario: string): number | null {
    const weights = VALUE_SCENARIOS[scenario];
    if (!weights)
        return null;
    const metrics: Record<string, number | null> = {
        quality: snapshot.benchmarkScore,
        input_price: priceScore(snapshot.inputPrice),
        output_price: priceScore(snapshot.outputPrice),
        cache: priceScore(snapshot.cachePrice),
        context: contextScore(snapshot.context),
        tool_use: boolScore(snapshot.toolCalling),
        reasoning: boolScore(snapshot.reasoning),
        modality: snapshot.hasVision ? 100 : snapshot.modalityCount > 1 ? 60 : snapshot.modalityCount === 1 ? 35 : 0,
        license: opennessScore(snapshot.openness),
        open_weight: snapshot.openness === "open_weight" ? 100 : snapshot.openness === "open_source" ? 90 : null,
    };
    let weighted = 0;
    let available = 0;
    for (const [key, weight] of Object.entries(weights)) {
        const value = metrics[key];
        if (value == null)
            continue;
        weighted += value * weight;
        available += weight;
    }
    const coverage = available / Object.values(weights).reduce((sum, item) => sum + item, 0);
    if (!available)
        return null;
    return Math.round(((weighted / available) * (0.65 + 0.35 * coverage)) * 10) / 10;
}

function formatMoney(value: number | null, locale: string): string {
    if (value == null)
        return "—";
    return `$${value.toLocaleString(locale, { maximumFractionDigits: 4 })}`;
}

function formatContext(value: number | null, locale: string, language: Language): string {
    if (value == null)
        return "—";
    return language === "tr" ? `${value.toLocaleString(locale)} token` : `${value.toLocaleString(locale)} tokens`;
}

function formatBool(value: boolean | null, language: Language): string {
    if (value == null)
        return language === "tr" ? "Bilinmiyor" : "Unknown";
    if (language === "tr")
        return value ? "Var" : "Yok";
    return value ? "Yes" : "No";
}

function pickWinner(
    snapshots: ModelSnapshot[],
    score: (item: ModelSnapshot) => number | null,
    higherIsBetter = true,
): string | null {
    const ranked = snapshots
        .map(item => ({ id: item.id, value: score(item) }))
        .filter((item): item is { id: string; value: number } => item.value != null);
    if (ranked.length < 2)
        return ranked[0]?.id ?? null;
    ranked.sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value);
    if (ranked[0].value === ranked[1].value)
        return null;
    return ranked[0].id;
}

function isEmptyMatrixValue(value: string): boolean {
    return value === "—" || value === "Bilinmiyor" || value === "Unknown";
}

const BOOL_MATRIX_ROWS = new Set(["tool", "reasoning"]);

const MATRIX_LABELS: Record<Language, Record<string, string>> = {
    tr: {
        context: "Context penceresi",
        input: "Girdi fiyatı / 1M",
        output: "Çıktı fiyatı / 1M",
        cache: "Cached input / 1M",
        benchmark: "Benchmark puanı",
        rank: "En iyi sıra",
        modalities: "Modaliteler",
        tool: "Tool calling",
        reasoning: "Reasoning",
        openness: "Açıklık",
        license: "Lisans",
    },
    en: {
        context: "Context window",
        input: "Input price / 1M",
        output: "Output price / 1M",
        cache: "Cached input / 1M",
        benchmark: "Benchmark score",
        rank: "Best rank",
        modalities: "Modalities",
        tool: "Tool calling",
        reasoning: "Reasoning",
        openness: "Openness",
        license: "License",
    },
};

export function buildDimensionMatrix(snapshots: ModelSnapshot[], language: Language, locale: string): DimensionRow[] {
    const labels = MATRIX_LABELS[language];
    const rows: DimensionRow[] = [
        {
            id: "context",
            label: labels.context,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatContext(item.context, locale, language)])),
            winnerId: pickWinner(snapshots, item => item.context),
        },
        {
            id: "input",
            label: labels.input,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatMoney(item.inputPrice, locale)])),
            winnerId: pickWinner(snapshots, item => item.inputPrice, false),
        },
        {
            id: "output",
            label: labels.output,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatMoney(item.outputPrice, locale)])),
            winnerId: pickWinner(snapshots, item => item.outputPrice, false),
        },
        {
            id: "cache",
            label: labels.cache,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatMoney(item.cachePrice, locale)])),
            winnerId: pickWinner(snapshots, item => item.cachePrice, false),
        },
        {
            id: "benchmark",
            label: labels.benchmark,
            values: Object.fromEntries(snapshots.map(item => [item.id, item.benchmarkScore == null ? "—" : String(item.benchmarkScore)])),
            winnerId: pickWinner(snapshots, item => item.benchmarkScore),
        },
        {
            id: "rank",
            label: labels.rank,
            values: Object.fromEntries(snapshots.map(item => [item.id, item.bestRank == null ? "—" : `#${item.bestRank}`])),
            winnerId: pickWinner(snapshots, item => item.bestRank == null ? null : -item.bestRank),
        },
        {
            id: "modalities",
            label: labels.modalities,
            values: Object.fromEntries(snapshots.map(item => [item.id, item.modalities.length ? item.modalities.join(", ") : "—"])),
            winnerId: pickWinner(snapshots, item => item.modalityCount),
        },
        {
            id: "tool",
            label: labels.tool,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatBool(item.toolCalling, language)])),
            winnerId: pickWinner(snapshots, item => boolScore(item.toolCalling)),
        },
        {
            id: "reasoning",
            label: labels.reasoning,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatBool(item.reasoning, language)])),
            winnerId: pickWinner(snapshots, item => boolScore(item.reasoning)),
        },
        {
            id: "openness",
            label: labels.openness,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatAccessLabel(item.openness, language)])),
            winnerId: pickWinner(snapshots, item => opennessScore(item.openness)),
        },
        {
            id: "license",
            label: labels.license,
            values: Object.fromEntries(snapshots.map(item => [item.id, formatLicenseLabel(item.license, language)])),
            winnerId: null,
        },
    ];
    return rows.filter(row => snapshots.some(item => !isEmptyMatrixValue(row.values[item.id])));
}

export function isBoolMatrixValue(rowId: string, raw: string): boolean {
    return BOOL_MATRIX_ROWS.has(rowId) && (raw === "Var" || raw === "Yok" || raw === "Bilinmiyor" || raw === "Yes" || raw === "No" || raw === "Unknown");
}

function relativeAdvantage(a: number | null, b: number | null, higherIsBetter: boolean): "win" | "lose" | "tie" | "unknown" {
    if (a == null || b == null)
        return "unknown";
    if (a === b)
        return "tie";
    if (higherIsBetter)
        return a > b ? "win" : "lose";
    return a < b ? "win" : "lose";
}

export function buildInsights(snapshots: ModelSnapshot[], language: Language, locale: string): ModelInsight[] {
    if (snapshots.length < 2)
        return snapshots.map(item => ({ id: item.id, name: item.name, pros: [], cons: [] }));
  const [first, ...rest] = snapshots;
    return snapshots.map(current => {
        const pros: string[] = [];
        const cons: string[] = [];
        const others = snapshots.filter(item => item.id !== current.id);
        for (const other of others) {
            const contextCmp = relativeAdvantage(current.context, other.context, true);
            if (contextCmp === "win" && current.context && other.context && current.context > other.context * 1.15)
                pros.push(language === "tr"
                    ? `${other.name}'e göre daha geniş context (${formatContext(current.context, locale, language)})`
                    : `Wider context than ${other.name} (${formatContext(current.context, locale, language)})`);
            if (contextCmp === "lose" && current.context && other.context && current.context < other.context * 0.85)
                cons.push(language === "tr"
                    ? `${other.name} daha geniş context sunuyor`
                    : `${other.name} offers a wider context window`);

            const inputCmp = relativeAdvantage(current.inputPrice, other.inputPrice, false);
            if (inputCmp === "win" && current.inputPrice != null && other.inputPrice != null)
                pros.push(language === "tr"
                    ? `${other.name}'e göre daha düşük girdi fiyatı (${formatMoney(current.inputPrice, locale)})`
                    : `Lower input price than ${other.name} (${formatMoney(current.inputPrice, locale)})`);
            if (inputCmp === "lose" && current.inputPrice != null && other.inputPrice != null && current.inputPrice > other.inputPrice * 1.12)
                cons.push(language === "tr"
                    ? `Girdi fiyatı ${other.name}'e göre daha yüksek`
                    : `Input price is higher than ${other.name}`);

            const outputCmp = relativeAdvantage(current.outputPrice, other.outputPrice, false);
            if (outputCmp === "win" && current.outputPrice != null && other.outputPrice != null)
                pros.push(language === "tr"
                    ? `${other.name}'e göre daha düşük çıktı fiyatı`
                    : `Lower output price than ${other.name}`);
            if (outputCmp === "lose" && current.outputPrice != null && other.outputPrice != null && current.outputPrice > other.outputPrice * 1.12)
                cons.push(language === "tr"
                    ? `Çıktı fiyatı ${other.name}'e göre daha yüksek`
                    : `Output price is higher than ${other.name}`);

            const benchCmp = relativeAdvantage(current.benchmarkScore, other.benchmarkScore, true);
            if (benchCmp === "win" && current.benchmarkScore != null)
                pros.push(language === "tr"
                    ? `${other.name}'e göre daha yüksek benchmark puanı (${current.benchmarkScore})`
                    : `Higher benchmark score than ${other.name} (${current.benchmarkScore})`);
            if (benchCmp === "lose" && current.benchmarkScore != null && other.benchmarkScore != null)
                cons.push(language === "tr"
                    ? `Benchmark puanı ${other.name}'in gerisinde`
                    : `Benchmark score trails ${other.name}`);

            if (current.toolCalling === true && other.toolCalling !== true)
                pros.push(language === "tr" ? "Tool calling desteği mevcut" : "Supports tool calling");
            if (current.toolCalling !== true && other.toolCalling === true)
                cons.push(language === "tr"
                    ? `${other.name} tool calling destekliyor, bu modelde yok veya bilinmiyor`
                    : `${other.name} supports tool calling; this model doesn't or it's unknown`);

            if (current.reasoning === true && other.reasoning !== true)
                pros.push(language === "tr" ? "Reasoning / düşünme modu destekleniyor" : "Supports a reasoning / thinking mode");
            if (current.reasoning !== true && other.reasoning === true)
                cons.push(language === "tr" ? `${other.name} reasoning modu sunuyor` : `${other.name} offers a reasoning mode`);

            if (current.hasVision && !other.hasVision)
                pros.push(language === "tr" ? "Görsel / multimodal girdi desteği var" : "Supports vision / multimodal input");
            if (!current.hasVision && other.hasVision)
                cons.push(language === "tr" ? `${other.name} görsel girdi destekliyor` : `${other.name} supports vision input`);

            const openCmp = relativeAdvantage(opennessScore(current.openness), opennessScore(other.openness), true);
            if (openCmp === "win" && current.openness && current.openness !== "proprietary")
                pros.push(language === "tr"
                    ? `Daha açık lisans profili (${current.openness})`
                    : `A more open licensing profile (${current.openness})`);
            if (openCmp === "lose" && other.openness && other.openness !== current.openness)
                cons.push(language === "tr"
                    ? `${other.name} lisans açısından daha esnek`
                    : `${other.name} is more flexible in terms of licensing`);
        }
        const uniquePros = [...new Set(pros)].slice(0, 5);
        const uniqueCons = [...new Set(cons)].slice(0, 4);
        if (!uniquePros.length && !uniqueCons.length && snapshots.length === 2) {
            if (current.id === first.id)
                uniquePros.push(language === "tr"
                    ? "İki model de benzer profilde; senaryo önerilerine bakarak seçim yapabilirsin."
                    : "Both models have a similar profile; check the scenario suggestions to help decide.");
        }
        return { id: current.id, name: current.name, pros: uniquePros, cons: uniqueCons };
    });
}

function scenarioReason(scenario: string, winner: ModelSnapshot, snapshots: ModelSnapshot[], language: Language): string {
    if (language === "tr") {
        switch (scenario) {
            case "chat":
                return winner.benchmarkScore != null
                    ? "Genel kalite ve fiyat dengesi benchmark + maliyet verisine göre öne çıkıyor."
                    : "Mevcut fiyat ve context verisine göre genel sohbet için daha dengeli.";
            case "coding":
                return winner.toolCalling
                    ? "Kodlama senaryosunda tool calling ve maliyet profili daha uygun."
                    : "Kodlama için fiyat ve benchmark profili rakiplerine göre daha güçlü.";
            case "long_document":
                return winner.context && winner.context >= 100000
                    ? "Uzun belgeler için geniş context penceresi belirleyici oldu."
                    : "Uzun metin işlerinde context ve cache maliyeti daha avantajlı.";
            case "agent":
                return winner.toolCalling
                    ? "Agent akışları için araç kullanımı ve reasoning sinyalleri daha güçlü."
                    : "Agent senaryosunda genel yetenek ve maliyet dengesi öne çıkıyor.";
            case "vision":
                return winner.hasVision
                    ? "Görsel / multimodal girdi desteği bu senaryoda kritik avantaj."
                    : "Multimodal profil ve maliyet dengesi rakiplerine göre daha iyi.";
            case "local":
                return winner.openness === "open_weight" || winner.openness === "open_source"
                    ? "Açık kaynak / açık ağırlık profili yerel dağıtım için daha uygun."
                    : "Yerel kullanım için lisans ve erişim profili daha esnek görünüyor.";
            case "high_volume":
                return "Yüksek token hacminde girdi/çıktı ve cache maliyeti belirleyici oldu.";
            case "low_latency":
                return "Hızlı ve ekonomik yanıt için fiyat profili öne çıkıyor.";
            default:
                return snapshots.length > 1 ? "Mevcut verilere göre bu senaryoda öne çıkıyor." : "";
        }
    }
    switch (scenario) {
        case "chat":
            return winner.benchmarkScore != null
                ? "Stands out on the balance of overall quality and price, based on benchmark and cost data."
                : "More balanced for general chat based on available price and context data.";
        case "coding":
            return winner.toolCalling
                ? "Tool calling and cost profile are a better fit for coding scenarios."
                : "Price and benchmark profile are stronger than competitors for coding.";
        case "long_document":
            return winner.context && winner.context >= 100000
                ? "A wide context window was the deciding factor for long documents."
                : "Context and cache cost are more favorable for long-text work.";
        case "agent":
            return winner.toolCalling
                ? "Tool use and reasoning signals are stronger for agent workflows."
                : "Overall capability and cost balance stand out for agent scenarios.";
        case "vision":
            return winner.hasVision
                ? "Vision / multimodal input support is a critical advantage in this scenario."
                : "Multimodal profile and cost balance are better than competitors.";
        case "local":
            return winner.openness === "open_weight" || winner.openness === "open_source"
                ? "An open-source / open-weight profile is a better fit for local deployment."
                : "License and access profile look more flexible for local use.";
        case "high_volume":
            return "Input/output and cache cost at high token volume were the deciding factor.";
        case "low_latency":
            return "Price profile stands out for fast, economical responses.";
        default:
            return snapshots.length > 1 ? "Stands out in this scenario based on the available data." : "";
    }
}

export function buildScenarioPicks(snapshots: ModelSnapshot[], language: Language): ScenarioPick[] {
    return Object.keys(VALUE_SCENARIOS).map(scenario => {
        const scores = snapshots.map(item => ({
            id: item.id,
            name: item.name,
            score: valueScore(item, scenario),
        }));
        const ranked = scores.filter(item => item.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const winner = ranked[0] ?? null;
        const runner = ranked[1] ?? null;
        const winnerSnap = winner ? snapshots.find(item => item.id === winner.id) ?? null : null;
        let reason = winnerSnap
            ? scenarioReason(scenario, winnerSnap, snapshots, language)
            : (language === "tr" ? "Karşılaştırma için yeterli veri yok." : "Not enough data to compare.");
        if (winner && runner && winner.score != null && runner.score != null && Math.abs(winner.score - runner.score) < 2)
            reason = language === "tr"
                ? `${winner.name} ile ${runner.name} çok yakın; ${reason}`
                : `${winner.name} and ${runner.name} are very close; ${reason}`;
        return {
            id: scenario,
            label: SCENARIO_LABELS[language][scenario] ?? scenario,
            winnerId: winner?.id ?? null,
            winnerName: winner?.name ?? null,
            reason,
            scores,
        };
    });
}
