import type { InsightsView } from "../components/ProductInsights";
import type { LeaderboardView } from "../components/LeaderboardPage";
import type { Language } from "./i18n";
import type { ModelItem, SortBy } from "./catalogTypes";

export const CAPABILITY_LABELS: Record<Language, Record<string, string>> = {
    tr: { reasoning: "Reasoning", coding: "Coding", vision: "Vision", multimodal: "Multimodal", tool_calling: "Tool calling", function_calling: "Function calling", computer_use: "Computer use", agents: "Agents", long_context: "Long context", web_search: "Web arama", prompt_caching: "Prompt önbellek", audio_input: "Ses girdisi", local_runnable: "Yerel çalıştırılabilir", ollama_compatible: "Ollama uyumlu", lm_studio_compatible: "LM Studio uyumlu" },
    en: { reasoning: "Reasoning", coding: "Coding", vision: "Vision", multimodal: "Multimodal", tool_calling: "Tool calling", function_calling: "Function calling", computer_use: "Computer use", agents: "Agents", long_context: "Long context", web_search: "Web search", prompt_caching: "Prompt caching", audio_input: "Audio input", local_runnable: "Locally runnable", ollama_compatible: "Ollama compatible", lm_studio_compatible: "LM Studio compatible" },
};
export const OPENNESS_LABELS: Record<Language, Record<string, string>> = {
    tr: { open_source: "Açık kaynak", open_weight: "Açık ağırlık", proprietary: "Kapalı kaynak", unknown: "Bilinmiyor" },
    en: { open_source: "Open source", open_weight: "Open weight", proprietary: "Closed source", unknown: "Unknown" },
};
export const BENCHMARK_FOCUS_LABELS: Record<Language, Record<string, string>> = {
    tr: { general: "Genel (yalnızca benchmarklı)", coding: "Coding (yalnızca benchmarklı)", reasoning: "Reasoning (yalnızca benchmarklı)", agent: "Agent (yalnızca benchmarklı)", multimodal: "Multimodal (yalnızca benchmarklı)" },
    en: { general: "General (benchmarked only)", coding: "Coding (benchmarked only)", reasoning: "Reasoning (benchmarked only)", agent: "Agent (benchmarked only)", multimodal: "Multimodal (benchmarked only)" },
};
export const runtimeCapabilityOptions = ["local_runnable", "ollama_compatible", "lm_studio_compatible"];
export const SORT_LABELS: Record<Language, Record<SortBy, string>> = {
    tr: { name: "Model adı", provider: "Geliştirici", context: "Context", input_price: "Girdi fiyatı", output_price: "Çıktı fiyatı", release_date: "Yayın tarihi", benchmark_score: "Benchmark puanı", parameter_count: "Parametre sayısı", active_parameter_count: "Aktif parametre", backend: "Backend", updated_at: "En güncel", best_match: "Benchmark uyumu" },
    en: { name: "Model name", provider: "Developer", context: "Context", input_price: "Input price", output_price: "Output price", release_date: "Release date", benchmark_score: "Benchmark score", parameter_count: "Parameter count", active_parameter_count: "Active parameters", backend: "Backend", updated_at: "Last updated", best_match: "Benchmark match" },
};
export const MODALITY_LABELS: Record<Language, Record<string, string>> = {
    tr: { text: "metin", image: "görsel", audio: "ses", video: "video", file: "dosya", pdf: "PDF" },
    en: { text: "text", image: "image", audio: "audio", video: "video", file: "file", pdf: "PDF" },
};

export function money(value: string | null | undefined, locale: string) {
    if (value == null) return "—";
    return `$${Number(value).toLocaleString(locale, { maximumFractionDigits: 4 })}`;
}
export function compact(value: number, locale: string) {
    if (value >= 1000000) return `${(value / 1000000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`;
    if (value >= 1000) return `${(value / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}K`;
    return value.toLocaleString(locale);
}
export function trModality(tag: string, language: Language) {
    return MODALITY_LABELS[language][tag.toLowerCase()] ?? tag;
}
export function trCapability(value: string, language: Language) {
    return CAPABILITY_LABELS[language][value] ?? value.replaceAll("_", " ");
}
export function normalizeModelKey(value: string) {
    return value.toLowerCase().trim().replace(/_/g, "-");
}
export function leaderboardModelCandidates(value: string) {
    const parts = value.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean);
    const ordered = parts.length > 1 ? [...parts].reverse().concat(value.trim()) : parts;
    const seen = new Set<string>();
    return ordered.filter(candidate => {
        const key = normalizeModelKey(candidate);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
export function findLocalModel(modelName: string, organization: string, catalog: ModelItem[]) {
    const key = normalizeModelKey(modelName);
    const orgKey = organization.toLowerCase().trim();
    const candidates = catalog.filter(model => {
        const slug = normalizeModelKey(model.slug);
        const name = normalizeModelKey(model.name);
        return slug === key || name === key || slug.includes(key) || key.includes(slug);
    });
    if (!candidates.length) return null;
    const orgMatch = candidates.find(model => model.company.name.toLowerCase() === orgKey || model.company.slug === orgKey);
    if (orgMatch) return orgMatch;
    // Organizasyon eslesmedi: isim/slug zaten tek bir adaya indiriyorsa kabul ederiz
    // (org etiketi farkli yazilmis olabilir), ama birden fazla adayda hangisinin
    // dogru model oldugunu tahmin etmeyiz - catalog_model_id/kesin eslesme olmadan
    // ilkini secmek yanlis modeli sessizce gostermek anlamina gelir.
    return candidates.length === 1 ? candidates[0] : null;
}

export const SIDEBAR_GROUPS: Record<Language, { label: string; items: { id: string; label: string; icon: string }[] }[]> = {
    tr: [
        { label: "Keşfet", items: [{ id: "overview", label: "Genel bakış", icon: "⌂" }, { id: "leaderboard", label: "Benchmarklar", icon: "▥" }, { id: "models", label: "Model kataloğu", icon: "◫" }, { id: "compare", label: "Karşılaştır", icon: "⇄" }] },
        { label: "Analiz", items: [{ id: "popularity", label: "Popüler modeller", icon: "↗" }, { id: "insights", label: "Pazar grafikleri", icon: "▤" }, { id: "turkish", label: "Türkiye LLM", icon: "TR" }] },
        { label: "İstihbarat", items: [{ id: "events", label: "Gelişmeler", icon: "◉" }, { id: "research", label: "Araştırma", icon: "⌁" }, { id: "radar", label: "Teknoloji radarı", icon: "◎" }, { id: "sources", label: "Kaynaklar", icon: "↗" }] },
        { label: "İletişim", items: [{ id: "feedback", label: "Geri bildirim", icon: "✉" }] },
    ],
    en: [
        { label: "Explore", items: [{ id: "overview", label: "Overview", icon: "⌂" }, { id: "leaderboard", label: "Benchmarks", icon: "▥" }, { id: "models", label: "Model catalog", icon: "◫" }, { id: "compare", label: "Compare", icon: "⇄" }] },
        { label: "Analysis", items: [{ id: "popularity", label: "Popular models", icon: "↗" }, { id: "insights", label: "Market charts", icon: "▤" }, { id: "turkish", label: "Turkey LLM", icon: "TR" }] },
        { label: "Intelligence", items: [{ id: "events", label: "Developments", icon: "◉" }, { id: "research", label: "Research", icon: "⌁" }, { id: "radar", label: "Technology radar", icon: "◎" }, { id: "sources", label: "Sources", icon: "↗" }] },
        { label: "Contact", items: [{ id: "feedback", label: "Feedback", icon: "✉" }] },
    ],
};
export const SECTION_META: Record<Language, Record<string, { group: string; title: string }>> = {
    tr: {
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
    },
    en: {
        overview: { group: "Explore", title: "Overview" },
        leaderboard: { group: "Explore", title: "Benchmark rankings" },
        models: { group: "Explore", title: "Model catalog" },
        compare: { group: "Explore", title: "Model comparison" },
        popularity: { group: "Analysis", title: "Popular models" },
        insights: { group: "Analysis", title: "Market charts" },
        turkish: { group: "Analysis", title: "Turkish-focused models" },
        events: { group: "Intelligence", title: "Developments" },
        research: { group: "Intelligence", title: "Research feed" },
        radar: { group: "Intelligence", title: "Technology radar" },
        sources: { group: "Intelligence", title: "Source catalog" },
        feedback: { group: "Contact", title: "Feedback" },
    },
};
export const insightViews = new Set<InsightsView>(["popularity", "insights", "turkish"]);
export const BENCHMARK_INFO: Record<Language, Record<LeaderboardView, {
    name: string;
    summary: string;
    measure: string;
    reading: string;
}>> = {
    tr: {
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
    },
    en: {
        general: { name: "Chatbot Arena", summary: "A preference-based evaluation where humans blindly compare two models' responses.", measure: "Arena Rating, vote count, and confidence interval", reading: "The higher the rating and the closer to rank 1, the stronger the human-preference performance." },
        coding: { name: "SWE-bench Verified", summary: "Measures a model's ability to resolve real GitHub issues in existing code repositories.", measure: "Percentage of tasks resolved successfully", reading: "A higher resolve rate is better; the agent and harness used can affect the result." },
        "swe-live": { name: "SWE-bench Live", summary: "A live coding evaluation with fresh, multilingual software tasks that reduces data-leakage risk.", measure: "Resolve rate on verified real tasks", reading: "A higher rate is better; the date window and agent used should be weighed together." },
        "tau-bench": { name: "τ-bench", summary: "Measures whether a model can complete a task by correctly using tools and APIs in realistic workflows.", measure: "Pass@1 task success rate", reading: "Higher first-attempt success means more reliable tool use." },
        livecodebench: { name: "LiveCodeBench", summary: "Measures code-generation success with current problems and contamination filtering.", measure: "Pass@1 code resolve rate", reading: "A higher score is better; the recent date window reduces the effect of memorized answers." },
        intelligence: { name: "Artificial Analysis Intelligence Index", summary: "Combines several knowledge and reasoning tests into a single independent index.", measure: "Composite intelligence index", reading: "A higher index points to stronger general problem-solving performance." },
        "aa-coding": { name: "Artificial Analysis Coding Index", summary: "Aggregates multiple coding evaluations under one independent score.", measure: "Composite coding index", reading: "A higher score shows stronger performance on code-generation and software tasks." },
        agentic: { name: "Artificial Analysis Agentic Index", summary: "Measures a model's success on multi-step, tool-using, goal-directed tasks.", measure: "Composite agentic task score", reading: "A higher score means more consistent planning and task completion." },
        livebench: { name: "LiveBench", summary: "A regularly refreshed academic and practical evaluation set designed to reduce contamination.", measure: "Category and overall success score", reading: "A higher score is better; check per-category results alongside the overall score." },
        "livebench-math": { name: "LiveBench — Math", summary: "Measures model performance on LiveBench's math subcategory.", measure: "Percentage of correct answers", reading: "A higher score means stronger mathematical reasoning." },
        "livebench-reasoning": { name: "LiveBench — Reasoning", summary: "Measures multi-step reasoning ability on LiveBench's reasoning subcategory.", measure: "Percentage of correct answers", reading: "A higher score performs better on complex logic tasks." },
        "livebench-coding": { name: "LiveBench — Coding", summary: "Measures program generation and solving success on LiveBench's coding subcategory.", measure: "Percentage of correct answers", reading: "A higher score means stronger code-generation performance." },
        "mmlu-pro": { name: "MMLU-Pro", summary: "An academic knowledge test across 14 domains with harder options and more reasoning required.", measure: "Percentage of correct answers", reading: "Higher accuracy is better; domain selection makes it easier to see a model's specialty." },
    },
};
