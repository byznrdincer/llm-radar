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

export const SCENARIO_LABELS: Record<string, string> = {
    chat: "Genel sohbet",
    coding: "Kodlama",
    long_document: "Uzun belge",
    agent: "Agent / araç kullanımı",
    vision: "Görsel & multimodal",
    local: "Yerel / açık kaynak",
    high_volume: "Yüksek hacim",
    low_latency: "Maliyet odaklı hızlı yanıt",
};

const ACCESS_LABELS: Record<string, string> = {
    open_source: "Açık kaynak",
    open_weight: "Açık ağırlık",
    proprietary: "Kapalı kaynak",
    unknown: "Bilinmiyor",
};

function formatAccessLabel(value: string | null | undefined): string {
    if (!value)
        return "Bilinmiyor";
    const normalized = value.trim().toLowerCase().replace(/-/g, "_");
    return ACCESS_LABELS[normalized] ?? value.replaceAll("_", " ");
}

function formatLicenseLabel(value: string | null | undefined): string {
    if (!value)
        return "Bilinmiyor";
    const normalized = value.trim();
    if (normalized.toLowerCase() === "proprietary")
        return "Kapalı kaynak";
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
    if (license.toLowerCase() === "proprietary" || license.toLowerCase() === "kapalı kaynak")
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

function formatMoney(value: number | null): string {
    if (value == null)
        return "—";
    return `$${value.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`;
}

function formatContext(value: number | null): string {
    if (value == null)
        return "—";
    return `${value.toLocaleString("tr-TR")} token`;
}

function formatBool(value: boolean | null): string {
    if (value == null)
        return "Bilinmiyor";
    return value ? "Var" : "Yok";
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
    return value === "—" || value === "Bilinmiyor";
}

const BOOL_MATRIX_ROWS = new Set(["tool", "reasoning"]);

export function buildDimensionMatrix(snapshots: ModelSnapshot[]): DimensionRow[] {
    const rows: DimensionRow[] = [
        {
            id: "context",
            label: "Context penceresi",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatContext(item.context)])),
            winnerId: pickWinner(snapshots, item => item.context),
        },
        {
            id: "input",
            label: "Girdi fiyatı / 1M",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatMoney(item.inputPrice)])),
            winnerId: pickWinner(snapshots, item => item.inputPrice, false),
        },
        {
            id: "output",
            label: "Çıktı fiyatı / 1M",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatMoney(item.outputPrice)])),
            winnerId: pickWinner(snapshots, item => item.outputPrice, false),
        },
        {
            id: "cache",
            label: "Cached input / 1M",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatMoney(item.cachePrice)])),
            winnerId: pickWinner(snapshots, item => item.cachePrice, false),
        },
        {
            id: "benchmark",
            label: "Benchmark puanı",
            values: Object.fromEntries(snapshots.map(item => [item.id, item.benchmarkScore == null ? "—" : String(item.benchmarkScore)])),
            winnerId: pickWinner(snapshots, item => item.benchmarkScore),
        },
        {
            id: "rank",
            label: "En iyi sıra",
            values: Object.fromEntries(snapshots.map(item => [item.id, item.bestRank == null ? "—" : `#${item.bestRank}`])),
            winnerId: pickWinner(snapshots, item => item.bestRank == null ? null : -item.bestRank),
        },
        {
            id: "modalities",
            label: "Modaliteler",
            values: Object.fromEntries(snapshots.map(item => [item.id, item.modalities.length ? item.modalities.join(", ") : "—"])),
            winnerId: pickWinner(snapshots, item => item.modalityCount),
        },
        {
            id: "tool",
            label: "Tool calling",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatBool(item.toolCalling)])),
            winnerId: pickWinner(snapshots, item => boolScore(item.toolCalling)),
        },
        {
            id: "reasoning",
            label: "Reasoning",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatBool(item.reasoning)])),
            winnerId: pickWinner(snapshots, item => boolScore(item.reasoning)),
        },
        {
            id: "openness",
            label: "Açıklık",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatAccessLabel(item.openness)])),
            winnerId: pickWinner(snapshots, item => opennessScore(item.openness)),
        },
        {
            id: "license",
            label: "Lisans",
            values: Object.fromEntries(snapshots.map(item => [item.id, formatLicenseLabel(item.license)])),
            winnerId: null,
        },
    ];
    return rows.filter(row => snapshots.some(item => !isEmptyMatrixValue(row.values[item.id])));
}

export function isBoolMatrixValue(rowId: string, raw: string): boolean {
    return BOOL_MATRIX_ROWS.has(rowId) && (raw === "Var" || raw === "Yok" || raw === "Bilinmiyor");
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

export function buildInsights(snapshots: ModelSnapshot[]): ModelInsight[] {
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
                pros.push(`${other.name}'e göre daha geniş context (${formatContext(current.context)})`);
            if (contextCmp === "lose" && current.context && other.context && current.context < other.context * 0.85)
                cons.push(`${other.name} daha geniş context sunuyor`);

            const inputCmp = relativeAdvantage(current.inputPrice, other.inputPrice, false);
            if (inputCmp === "win" && current.inputPrice != null && other.inputPrice != null)
                pros.push(`${other.name}'e göre daha düşük girdi fiyatı (${formatMoney(current.inputPrice)})`);
            if (inputCmp === "lose" && current.inputPrice != null && other.inputPrice != null && current.inputPrice > other.inputPrice * 1.12)
                cons.push(`Girdi fiyatı ${other.name}'e göre daha yüksek`);

            const outputCmp = relativeAdvantage(current.outputPrice, other.outputPrice, false);
            if (outputCmp === "win" && current.outputPrice != null && other.outputPrice != null)
                pros.push(`${other.name}'e göre daha düşük çıktı fiyatı`);
            if (outputCmp === "lose" && current.outputPrice != null && other.outputPrice != null && current.outputPrice > other.outputPrice * 1.12)
                cons.push(`Çıktı fiyatı ${other.name}'e göre daha yüksek`);

            const benchCmp = relativeAdvantage(current.benchmarkScore, other.benchmarkScore, true);
            if (benchCmp === "win" && current.benchmarkScore != null)
                pros.push(`${other.name}'e göre daha yüksek benchmark puanı (${current.benchmarkScore})`);
            if (benchCmp === "lose" && current.benchmarkScore != null && other.benchmarkScore != null)
                cons.push(`Benchmark puanı ${other.name}'in gerisinde`);

            if (current.toolCalling === true && other.toolCalling !== true)
                pros.push("Tool calling desteği mevcut");
            if (current.toolCalling !== true && other.toolCalling === true)
                cons.push(`${other.name} tool calling destekliyor, bu modelde yok veya bilinmiyor`);

            if (current.reasoning === true && other.reasoning !== true)
                pros.push("Reasoning / düşünme modu destekleniyor");
            if (current.reasoning !== true && other.reasoning === true)
                cons.push(`${other.name} reasoning modu sunuyor`);

            if (current.hasVision && !other.hasVision)
                pros.push("Görsel / multimodal girdi desteği var");
            if (!current.hasVision && other.hasVision)
                cons.push(`${other.name} görsel girdi destekliyor`);

            const openCmp = relativeAdvantage(opennessScore(current.openness), opennessScore(other.openness), true);
            if (openCmp === "win" && current.openness && current.openness !== "proprietary")
                pros.push(`Daha açık lisans profili (${current.openness})`);
            if (openCmp === "lose" && other.openness && other.openness !== current.openness)
                cons.push(`${other.name} lisans açısından daha esnek`);
        }
        const uniquePros = [...new Set(pros)].slice(0, 5);
        const uniqueCons = [...new Set(cons)].slice(0, 4);
        if (!uniquePros.length && !uniqueCons.length && snapshots.length === 2) {
            if (current.id === first.id)
                uniquePros.push("İki model de benzer profilde; senaryo önerilerine bakarak seçim yapabilirsin.");
        }
        return { id: current.id, name: current.name, pros: uniquePros, cons: uniqueCons };
    });
}

function scenarioReason(scenario: string, winner: ModelSnapshot, snapshots: ModelSnapshot[]): string {
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

export function buildScenarioPicks(snapshots: ModelSnapshot[]): ScenarioPick[] {
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
        let reason = winnerSnap ? scenarioReason(scenario, winnerSnap, snapshots) : "Karşılaştırma için yeterli veri yok.";
        if (winner && runner && winner.score != null && runner.score != null && Math.abs(winner.score - runner.score) < 2)
            reason = `${winner.name} ile ${runner.name} çok yakın; ${reason}`;
        return {
            id: scenario,
            label: SCENARIO_LABELS[scenario] ?? scenario,
            winnerId: winner?.id ?? null,
            winnerName: winner?.name ?? null,
            reason,
            scores,
        };
    });
}
