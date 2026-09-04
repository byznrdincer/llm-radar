import type { Language } from "./i18n";

export const feedbackOptions = [
  ["missing_model", "Eksik model", "Missing model"],
  ["data_error", "Hatalı model verisi", "Incorrect model data"],
  ["pricing_error", "Fiyat hatası", "Pricing error"],
  ["benchmark_error", "Benchmark hatası", "Benchmark error"],
  ["source_suggestion", "Yeni kaynak önerisi", "New source suggestion"],
  ["filter_suggestion", "Filtre önerisi", "Filter suggestion"],
  ["feature_request", "Özellik isteği", "Feature request"],
  ["ux_feedback", "UI / UX geri bildirimi", "UI / UX feedback"],
  ["bug_report", "Hata bildirimi", "Bug report"],
  ["general", "Genel yorum", "General comment"],
] as const;

export const subjectOptions = [
  ["price", "Fiyat", "Price"],
  ["benchmark", "Benchmark", "Benchmark"],
  ["context", "Context", "Context"],
  ["license", "Lisans", "License"],
  ["capability", "Yetenek / capability", "Capability"],
  ["provider", "Provider", "Provider"],
  ["source", "Kaynak", "Source"],
  ["other", "Diğer", "Other"],
] as const;

export const productAreas = [
  ["model_catalog", "Model kataloğu", "Model catalog"],
  ["compare", "Karşılaştır", "Compare"],
  ["benchmarks", "Benchmarklar", "Benchmarks"],
  ["popular", "Popüler modeller", "Popular models"],
  ["market", "Pazar grafikleri", "Market charts"],
  ["turkish_llm", "Türkiye LLM", "Turkey LLM"],
  ["developments", "Gelişmeler", "Developments"],
  ["research", "Araştırma", "Research"],
  ["technology_radar", "Teknoloji radarı", "Technology radar"],
  ["sources", "Kaynaklar", "Sources"],
  ["feedback", "Geri bildirim", "Feedback"],
  ["other", "Diğer", "Other"],
] as const;

export const useCaseOptions = [
  ["chat", "Sohbet", "Chat"],
  ["rag", "RAG / Doküman", "RAG / Documents"],
  ["coding", "Kodlama", "Coding"],
  ["agent", "Agent / Tool calling", "Agent / Tool calling"],
  ["multimodal", "Multimodal", "Multimodal"],
  ["enterprise", "Kurumsal", "Enterprise"],
  ["other", "Diğer", "Other"],
] as const;

export const criterionOptions = [
  ["performance", "Performans", "Performance"],
  ["price", "Fiyat", "Price"],
  ["speed", "Hız", "Speed"],
  ["turkish", "Türkçe kalitesi", "Turkish-language quality"],
  ["privacy", "Gizlilik", "Privacy"],
  ["open_weight", "Open-weight", "Open-weight"],
  ["data_residency", "Türkiye’de veri barındırma", "Data residency in Turkey"],
  ["openai_compatible", "OpenAI API uyumu", "OpenAI API compatibility"],
  ["fine_tuning", "Fine-tuning", "Fine-tuning"],
] as const;

export const userTypeOptions = [
  ["developer", "Developer", "Developer"],
  ["startup", "Startup", "Startup"],
  ["enterprise", "Kurumsal şirket", "Enterprise company"],
  ["organization", "Organizasyon", "Organization"],
  ["individual", "Bireysel", "Individual"],
] as const;

export const demandLevels = [
  ["interested", "İlgileniyorum", "Interested"],
  ["need", "İhtiyacım var", "I need this"],
  ["active_use", "Aktif kullanırım", "Actively using"],
] as const;

export const usageVolumeOptions = [
  ["", "Belirtmek istemiyorum", "Prefer not to say"],
  ["pilot", "Pilot · 1M token altı", "Pilot · under 1M tokens"],
  ["under_10m", "1–10M token / ay", "1–10M tokens / month"],
  ["under_100m", "10–100M token / ay", "10–100M tokens / month"],
  ["over_100m", "100M+ token / ay", "100M+ tokens / month"],
] as const;

export const budgetRangeOptions = [
  ["", "Belirtmek istemiyorum", "Prefer not to say"],
  ["unknown", "Henüz belli değil", "Not yet known"],
  ["under_100", "$100 altı / ay", "Under $100 / month"],
  ["100_500", "$100–500 / ay", "$100–500 / month"],
  ["500_2000", "$500–2.000 / ay", "$500–2,000 / month"],
  ["over_2000", "$2.000+ / ay", "$2,000+ / month"],
] as const;

export const timelineOptions = [
  ["", "Belirtmek istemiyorum", "Prefer not to say"],
  ["exploring", "Şimdilik araştırıyorum", "Just exploring for now"],
  ["this_quarter", "Bu çeyrek içinde", "Within this quarter"],
  ["immediate", "Hemen kullanmak istiyorum", "Want to start immediately"],
] as const;

export const severityOptions = [
  ["low", "Küçük", "Minor"],
  ["medium", "Önemli", "Major"],
  ["high", "Yüksek", "High"],
  ["critical", "Kritik", "Critical"],
] as const;

export const feedbackPlaceholders: Record<Language, Record<string, string>> = {
  tr: {
    missing_model:
      "Eklenmesini istediğin modelin adını, geliştiricisini ve biliyorsan resmî kaynağını yaz.",
    data_error:
      "Hangi bilginin yanlış veya eksik göründüğünü ve doğru olması gereken değeri anlat.",
    pricing_error:
      "Hangi fiyat bilgisinin yanlış olduğunu ve doğru fiyatı biliyorsan belirt.",
    benchmark_error:
      "Hangi benchmark sonucunda sorun olduğunu ve doğru olması gereken değeri belirt.",
    source_suggestion:
      "Radar'a eklenmesini istediğin kaynak veya platformu ve neden faydalı olduğunu anlat.",
    filter_suggestion:
      "Eklenmesini istediğin filtreyi ve hangi kullanım senaryosunda işe yarayacağını anlat.",
    feature_request:
      "İstediğin özelliği ve sana neyi kolaylaştıracağını kısaca anlat.",
    ux_feedback:
      "Hangi ekran veya akışta zorlandığını ve nasıl daha iyi olabileceğini anlat.",
    bug_report:
      "Ne yaptığını, ne olmasını beklediğini ve gerçekte ne olduğunu anlat.",
    general:
      "Görüşünü, önerini veya Radar hakkında paylaşmak istediğin şeyi yaz.",
  },
  en: {
    missing_model:
      "Tell us the model's name, its developer, and the official source if you know it.",
    data_error:
      "Describe which piece of information looks wrong or missing, and what the correct value should be.",
    pricing_error:
      "Tell us which price is wrong, and the correct price if you know it.",
    benchmark_error:
      "Tell us which benchmark result is off, and what the correct value should be.",
    source_suggestion:
      "Tell us which source or platform you'd like added to Radar, and why it would be useful.",
    filter_suggestion:
      "Tell us which filter you'd like added and what use case it would help with.",
    feature_request:
      "Briefly describe the feature you want and what it would make easier for you.",
    ux_feedback:
      "Tell us which screen or flow gave you trouble, and how it could be better.",
    bug_report:
      "Tell us what you did, what you expected to happen, and what actually happened.",
    general:
      "Share your thoughts, suggestions, or anything else about Radar.",
  },
};

export const modelRelatedFeedback = new Set([
  "data_error",
  "pricing_error",
  "benchmark_error",
]);

export const subjectFeedback = new Set([
  "data_error",
  "pricing_error",
  "benchmark_error",
]);

export const severityFeedback = new Set([
  "data_error",
  "pricing_error",
  "benchmark_error",
  "bug_report",
]);

export const sourceFeedback = new Set([
  "missing_model",
  "data_error",
  "pricing_error",
  "benchmark_error",
  "source_suggestion",
]);

export const productAreaFeedback = new Set([
  "filter_suggestion",
  "feature_request",
  "ux_feedback",
  "bug_report",
]);

export function toggleValue(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

export function submissionContext() {
  return {
    page: `${window.location.pathname}${window.location.hash}`,
    section: "feedback",
    locale: window.navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

export function optionLabel(
  entry: readonly [string, string, string],
  language: Language,
) {
  return language === "tr" ? entry[1] : entry[2];
}
