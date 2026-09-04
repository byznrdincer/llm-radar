import type { Language } from "./i18n";

export const STRINGS: Record<Language, {
  heading: string;
  subtitle: string;
  methodologyButton: string;
  methodologyNote: string;
  searchLabel: string;
  searchPlaceholder: string;
  categoryLabel: string;
  categoryAll: string;
  timeLabel: string;
  timeAll: string;
  time6h: string;
  time24h: string;
  time48h: string;
  time7d: string;
  time30d: string;
  time90d: string;
  importanceLabel: string;
  importanceAll: string;
  importanceCritical: string;
  importanceHigh: string;
  importanceMedium: string;
  importanceLow: string;
  importanceInfo: string;
  opennessLabel: string;
  opennessAll: string;
  opennessOpenSource: string;
  opennessOpenWeight: string;
  opennessProprietary: string;
  modelLevelLabel: string;
  modelLevelAll: string;
  modelLevelFrontier: string;
  modelLevelHigh: string;
  modelLevelMedium: string;
  sortLabel: string;
  sortPriority: string;
  sortRecent: string;
  sortImportance: string;
  clearFilters: string;
  featured: string;
  sourcePrefix: string;
  viewDetails: string;
  noDetails: string;
  viewAriaLabel: string;
  recentTab: string;
  savedTab: string;
  loading: string;
  emptySaved: string;
  emptyOther: string;
  emptyFiltered: string;
  loadingMore: string;
}> = {
  tr: {
    heading: "Teknoloji gelişmeleri",
    subtitle: "AI ekosistemindeki önemli değişiklikleri takip et.",
    methodologyButton: "Skorlama metodolojisi",
    methodologyNote: "Gelişmeler kaynak güvenilirliği, değişimin büyüklüğü, sektörel etki ve doğrulama durumuyla 0–100 puanlanır.",
    searchLabel: "Gelişme ara",
    searchPlaceholder: "Örn. Gemini 3.8",
    categoryLabel: "Kategori",
    categoryAll: "Tümü",
    timeLabel: "Zaman",
    timeAll: "Tüm zamanlar",
    time6h: "Son 6 saat",
    time24h: "Son 24 saat",
    time48h: "Son 48 saat",
    time7d: "Son 7 gün",
    time30d: "Son 30 gün",
    time90d: "Son 90 gün",
    importanceLabel: "Önem",
    importanceAll: "Tüm seviyeler",
    importanceCritical: "Kritik",
    importanceHigh: "Yüksek",
    importanceMedium: "Orta",
    importanceLow: "Düşük",
    importanceInfo: "Bilgi",
    opennessLabel: "Açıklık",
    opennessAll: "Tümü",
    opennessOpenSource: "Açık Kaynak",
    opennessOpenWeight: "Açık Ağırlık",
    opennessProprietary: "Kapalı Kaynak",
    modelLevelLabel: "Model seviyesi",
    modelLevelAll: "Tüm seviyeler",
    modelLevelFrontier: "Frontier",
    modelLevelHigh: "Yüksek",
    modelLevelMedium: "Orta",
    sortLabel: "Sıralama",
    sortPriority: "Öncelikli modeller",
    sortRecent: "En yeni",
    sortImportance: "En önemli",
    clearFilters: "Filtreleri temizle",
    featured: "Öne çıkan",
    sourcePrefix: "Kaynak:",
    viewDetails: "Detayı gör →",
    noDetails: "Detay yok",
    viewAriaLabel: "Gelişme görünümü",
    recentTab: "Son gelişmeler",
    savedTab: "Kaydedilenler",
    loading: "Gelişmeler yükleniyor…",
    emptySaved: "Henüz kaydedilmiş gelişme yok. Kartlardaki yer imine tıklayarak kaydedebilirsin.",
    emptyOther: "Başka gelişme yok.",
    emptyFiltered: "Bu filtrelerle gelişme bulunamadı.",
    loadingMore: "Daha fazla yükleniyor…",
  },
  en: {
    heading: "Technology updates",
    subtitle: "Track the key changes across the AI ecosystem.",
    methodologyButton: "Scoring methodology",
    methodologyNote: "Updates are scored 0–100 based on source reliability, magnitude of change, industry impact, and verification status.",
    searchLabel: "Search updates",
    searchPlaceholder: "e.g. Gemini 3.8",
    categoryLabel: "Category",
    categoryAll: "All",
    timeLabel: "Time",
    timeAll: "All time",
    time6h: "Last 6 hours",
    time24h: "Last 24 hours",
    time48h: "Last 48 hours",
    time7d: "Last 7 days",
    time30d: "Last 30 days",
    time90d: "Last 90 days",
    importanceLabel: "Importance",
    importanceAll: "All levels",
    importanceCritical: "Critical",
    importanceHigh: "High",
    importanceMedium: "Medium",
    importanceLow: "Low",
    importanceInfo: "Info",
    opennessLabel: "Openness",
    opennessAll: "All",
    opennessOpenSource: "Open Source",
    opennessOpenWeight: "Open Weight",
    opennessProprietary: "Closed Source",
    modelLevelLabel: "Model level",
    modelLevelAll: "All levels",
    modelLevelFrontier: "Frontier",
    modelLevelHigh: "High",
    modelLevelMedium: "Medium",
    sortLabel: "Sort",
    sortPriority: "Priority models",
    sortRecent: "Newest",
    sortImportance: "Most important",
    clearFilters: "Clear filters",
    featured: "Featured",
    sourcePrefix: "Source:",
    viewDetails: "View details →",
    noDetails: "No details",
    viewAriaLabel: "Event view",
    recentTab: "Recent updates",
    savedTab: "Saved",
    loading: "Loading updates…",
    emptySaved: "No saved updates yet. Click the bookmark icon on a card to save it.",
    emptyOther: "No other updates.",
    emptyFiltered: "No updates found for these filters.",
    loadingMore: "Loading more…",
  },
};
