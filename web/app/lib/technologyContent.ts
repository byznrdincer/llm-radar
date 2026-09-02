export type TechnologySlug =
  | "agent"
  | "mcp"
  | "model_routing"
  | "reasoning"
  | "moe"
  | "computer_use"
  | "context_compaction"
  | "multimodal"
  | "open_weights";

export type TechnologyAccent = "green" | "purple" | "blue" | "orange" | "teal" | "pink" | "amber" | "cyan";

export type TechnologyCopy = {
  slug: TechnologySlug;
  title: string;
  subtitle: string;
  shortDescription: string;
  purpose: string;
  latestDevelopment: string;
  whyImportant: string;
  /** Detay sayfası — birkaç paragraf */
  whatIs: string[];
  howItWorks: string;
  whyTrack: string;
  examples: string;
  keywords: string[];
  researchQuery: string;
  accent: TechnologyAccent;
};

/** Mockup: bu hafta öne çıkanlar */
export const FEATURED_SLUGS: TechnologySlug[] = ["mcp", "agent", "context_compaction"];

/** Öne çıkanlar dışındaki teknolojiler — sade liste */
export const GRID_SLUGS: TechnologySlug[] = [
  "moe",
  "reasoning",
  "computer_use",
  "model_routing",
  "multimodal",
  "open_weights",
];

export const TECHNOLOGY_COPY: Record<TechnologySlug, TechnologyCopy> = {
  agent: {
    slug: "agent",
    title: "Agentic AI",
    subtitle: "Agent Frameworks",
    shortDescription:
      "Modelin plan yapıp araç kullanarak bir görevi baştan sona tamamlamasını sağlar.",
    purpose:
      "Modelin sadece cevap vermek yerine plan yapmasını, araç kullanmasını ve bir görevi tamamlamasını sağlar.",
    latestDevelopment:
      "Coding ve computer-use agent'ları daha uzun görevleri bağımsız yürütmeye başladı.",
    whyImportant:
      "LLM'ler chatbot olmaktan çıkıp gerçek işleri yapan sistemlere dönüşüyor.",
    whatIs: [
      "AI agent, bir dil modelinin yalnızca tek seferlik cevap üretmekle kalmayıp bir hedefe ulaşana kadar adım adım ilerlemesini sağlayan yapıdır. Model önce ne yapması gerektiğini planlar, gerekirse dosya okur, kod çalıştırır veya web'de arama yapar, sonucu değerlendirir ve bir sonraki adıma geçer.",
      "Klasik chatbot'tan farkı budur: kullanıcı her adımı tek tek yazmak zorunda kalmaz. Agent, ara hedefleri kendi belirler ve hata aldığında stratejisini değiştirebilir. Bu yüzden kod yazma, veri analizi, müşteri desteği otomasyonu gibi çok adımlı işlerde kullanılır.",
    ],
    howItWorks:
      "Tipik akış şöyledir: kullanıcı bir hedef verir → model plan oluşturur → plan adımlarına uygun araçları (terminal, tarayıcı, API) çağırır → her adımın çıktısını okur → hedef tamamlanana veya limit dolana kadar devam eder. Claude Code, OpenAI Codex ve benzeri ürünler bu mantıkla çalışır.",
    whyTrack:
      "Agent yetenekleri hızla olgunlaşıyor. Hangi modellerin gerçek iş akışlarına taşındığını, hangi görev türlerinde güvenilir olduklarını erken görmek ürün ve altyapı kararlarını doğrudan etkiler. Özellikle coding ve computer-use alanlarındaki gelişmeler, LLM'lerin 'konuşan asistan' olmaktan çıkıp 'iş yapan sistem'e dönüşmesinin en net göstergesidir.",
    examples:
      "Bir GitHub issue'sunu okuyup patch yazması, Excel'deki veriyi analiz edip rapor üretmesi, takvimden toplantı bulup davet göndermesi veya bir web sitesinde form doldurması agent senaryolarına örnektir.",
    keywords: ["agent", "agentic", "tool use", "tool calling"],
    researchQuery: "ai agent tool use",
    accent: "green",
  },
  mcp: {
    slug: "mcp",
    title: "MCP",
    subtitle: "Model Context Protocol",
    shortDescription:
      "AI agent'ların dosya, veritabanı ve GitHub gibi araçlara ortak bir protokolle bağlanmasını sağlar.",
    purpose:
      "AI agent'ların dosya, veritabanı, GitHub ve diğer araçlara standart bir şekilde bağlanmasını sağlar.",
    latestDevelopment:
      "Yeni MCP server ve enterprise entegrasyonları yayımlanıyor.",
    whyImportant:
      "Her tool için ayrı entegrasyon geliştirme ihtiyacını azaltabilir.",
    whatIs: [
      "Model Context Protocol (MCP), yapay zeka uygulamalarının dış araçlara ve veri kaynaklarına bağlanması için tanımlanmış açık bir standarttır. USB'nin farklı cihazları aynı porta takmayı kolaylaştırması gibi, MCP de farklı AI istemcilerinin farklı veri kaynaklarına aynı yöntemle erişmesini hedefler.",
      "Anthropic tarafından öne çıkarılan protokol; dosya sistemleri, veritabanları, GitHub, Slack ve kurumsal sistemler gibi kaynaklara 'MCP server' adı verilen küçük bağlayıcılar üzerinden erişim sağlar. Böylece her AI uygulaması için sıfırdan entegrasyon yazmak gerekmez.",
    ],
    howItWorks:
      "Bir MCP server, belirli bir kaynağa (örneğin PostgreSQL veya bir GitHub reposu) erişim sunar. AI istemcisi (Cursor, Claude Desktop vb.) bu server'a bağlanır ve modele hangi araçların kullanılabileceğini bildirir. Model ihtiyaç duyduğunda server üzerinden veri okur veya işlem yapar.",
    whyTrack:
      "Agent ekosisteminde en büyük sürtünme noktası tool entegrasyonlarıdır. MCP bu sorunu standartlaştırarak çözmeyi amaçlıyor; yeni server'ların ve enterprise entegrasyonlarının hızla çoğalması, protokolün pratikte benimsenip benimsenmediğinin erken göstergesidir.",
    examples:
      "Cursor'ın codebase'e erişmesi, bir agent'ın Notion'dan doküman çekmesi veya veritabanından canlı sorgu yapması MCP server'lar ile mümkün hale gelir.",
    keywords: ["mcp", "model context protocol"],
    researchQuery: "model context protocol",
    accent: "green",
  },
  model_routing: {
    slug: "model_routing",
    title: "Model Routing",
    subtitle: "Model Yönlendirme",
    shortDescription:
      "Her isteği en uygun modele yönlendirerek kalite, hız ve maliyet dengesini sağlar.",
    purpose:
      "Her isteği aynı modele göndermek yerine görev için en uygun modeli seçer.",
    latestDevelopment:
      "Kalite, hız ve maliyeti birlikte değerlendiren routing yöntemleri yaygınlaşıyor.",
    whyImportant:
      "Daha pahalı modelleri yalnızca gerektiğinde kullanarak maliyeti azaltabilir.",
    whatIs: [
      "Model routing, gelen her kullanıcı isteğini tek bir büyük modele yönlendirmek yerine, isteğin zorluğuna ve gereksinimlerine göre en uygun modeli seçen akıllı bir katmandır. Basit sorular ucuz ve hızlı bir modele, karmaşık akıl yürütme gerektiren görevler ise daha güçlü (ve pahalı) bir modele gidebilir.",
      "OpenRouter, LiteLLM ve benzeri gateway'ler bu mantığı üretim ortamlarında yaygın şekilde kullanır. Amaç hem maliyeti düşürmek hem de kullanıcı deneyimini korumaktır.",
    ],
    howItWorks:
      "Router, isteği analiz eder — uzunluk, konu, geçmiş bağlam veya bir sınıflandırıcı model skoru kullanarak zorluk tahmin eder. Ardından önceden tanımlı kurallara veya öğrenilmiş bir policy'ye göre hedef modeli seçer. Bazı sistemler yanıt kalitesini izleyip zamanla routing stratejisini günceller.",
    whyTrack:
      "LLM maliyetleri hızla büyürken routing, en pratik optimizasyon araçlarından biridir. Kalite-hız-maliyet üçgeninde yeni yöntemlerin ortaya çıkması, hangi yaklaşımların gerçekten işe yaradığını anlamak için takip edilmeye değer.",
    examples:
      "Basit çeviri isteği küçük bir modele, hukuki doküman analizi büyük bir modele yönlendirilir. Bazı sistemlerde 'thinking' modu yalnızca zor sorularda devreye girer.",
    keywords: ["router", "model routing", "mixture of models"],
    researchQuery: "llm model routing",
    accent: "teal",
  },
  reasoning: {
    slug: "reasoning",
    title: "Reasoning",
    subtitle: "Akıl Yürütme",
    shortDescription:
      "Zor problemlerde modelin daha fazla düşünüp cevabını doğrulamasını sağlar.",
    purpose: "Zor problemlerde daha fazla düşünme ve doğrulama yapar.",
    latestDevelopment: "Uzun düşünme ve self-verification adımları yeni modellere ekleniyor.",
    whyImportant: "Matematik, kod ve planlama görevlerinde doğruluk artışı sağlayabilir.",
    whatIs: [
      "Reasoning modelleri, cevabı hemen yazdırmak yerine modelin önce 'düşünmesini' — ara adımlar, kontrol listeleri veya iç monolog üretmesini — sağlayan sistemlerdir. Chain-of-thought (düşünce zinciri) en bilinen yöntemdir: model problemi adımlara böler, her adımı açıklar, sonra sonuca varır.",
      "OpenAI o1/o3, DeepSeek R1, Claude extended thinking gibi modeller bu yaklaşımı ürünleştirir. Düşünme süreci kullanıcıya gösterilebilir veya gizlenebilir; amaç daha tutarlı ve doğru sonuç üretmektir.",
    ],
    howItWorks:
      "Model bir soru aldığında önce reasoning token'ları üretir (iç düşünce). Bu token'lar cevabın parçası değildir ama son cevabın kalitesini artırır. Bazı sistemler self-verification yapar: cevabı ürettikten sonra kontrol eder ve hata bulursa düzeltir.",
    whyTrack:
      "Akıl yürütme yeteneği, benchmark sıralamalarında ve gerçek dünya kullanımında belirleyici fark yaratıyor. Yeni reasoning teknikleri ve modeller hızla çıkıyor; hangilerinin gerçekten işe yaradığını ayırt etmek önemli.",
    examples:
      "Matematik olimpiyat sorusu, karmaşık kod debug'ı, mantık bulmacası veya çok adımlı planlama görevleri reasoning modellerinin güçlü olduğu alanlardır.",
    keywords: ["reasoning", "chain of thought", "thinking"],
    researchQuery: "llm reasoning chain of thought",
    accent: "blue",
  },
  moe: {
    slug: "moe",
    title: "MoE",
    subtitle: "Mixture of Experts",
    shortDescription:
      "Dev modelin tamamı yerine her token için yalnızca gerekli uzman parçalarını çalıştırır.",
    purpose: "Modelin tamamı yerine her token için gerekli uzman parçaları çalıştırır.",
    latestDevelopment: "Daha büyük MoE mimarileri daha düşük aktif parametre maliyetiyle yayımlanıyor.",
    whyImportant: "Büyük kapasiteyi daha verimli hesaplama ile sunabilir.",
    whatIs: [
      "Mixture of Experts (MoE), tek dev bir ağ yerine birçok 'uzman' alt-ağdan oluşan model mimarisidir. Her token işlenirken yalnızca birkaç uzman devreye girer; geri kalanı pasif kalır. Böylece toplam parametre sayısı çok yüksek olabilir ama inference maliyeti düşük kalır.",
      "Mixtral, DeepSeek-V3, GPT-4 class modellerin bir kısmı MoE mimarisi kullanır. '400B parametre' duyurusu yanıltıcı olabilir — aktif olarak çalışan parametre sayısı çok daha azdır.",
    ],
    howItWorks:
      "Bir router (gate) her token için hangi uzmanların aktif olacağını seçer. Seçilen uzmanlar o token'ı işler, çıktıları birleştirilir. Eğitim sırasında uzmanlar farklı konulara (kod, matematik, genel dil) uzmanlaşabilir.",
    whyTrack:
      "MoE, büyük model kapasitesini daha ucuz inference ile sunmanın ana yoludur. Yeni açık ve kapalı ağırlıklı MoE modelleri sık yayımlanıyor; mimari tercihler pazarın yönünü gösterir.",
    examples:
      "Mixtral 8x7B, DeepSeek-MoE ve benzeri modeller; toplamda milyarlarca parametre ama token başına çok daha az hesaplama.",
    keywords: ["moe", "mixture of experts", "mixture-of-experts"],
    researchQuery: "mixture of experts language model",
    accent: "purple",
  },
  computer_use: {
    slug: "computer_use",
    title: "Computer Use",
    subtitle: "Bilgisayar Kullanımı",
    shortDescription:
      "AI'ın ekranı görüp tıklama, yazma ve uygulama kullanmasını sağlar.",
    purpose:
      "AI'ın ekranı anlayıp tıklama, yazma ve uygulama kullanmasını sağlar.",
    latestDevelopment: "GUI agent'ları daha uzun otomasyon görevlerini tamamlayabiliyor.",
    whyImportant: "Ofis ve yazılım otomasyonunda yeni kullanım senaryoları açıyor.",
    whatIs: [
      "Computer use, bir AI modelinin ekran görüntüsünü veya arayüz durumunu okuyup gerçek bir bilgisayarda veya tarayıcıda tıklama, yazma, kaydırma gibi eylemler yapabilmesidir. Model bir insan gibi GUI (grafik arayüz) kullanır.",
      "Anthropic'in computer use özelliği, OpenAI Operator ve benzeri sistemler bu alandaki öncülerdir. API veya terminal yerine görsel arayüz üzerinden çalışır; bu da legacy yazılımlar ve web uygulamaları için otomasyonu mümkün kılar.",
    ],
    howItWorks:
      "Model periyodik ekran görüntüsü alır veya DOM/erişilebilirlik ağacını okur. Hangi öğeye tıklanacağına, ne yazılacağına karar verir. Eylem gerçekleştirilir, yeni durum okunur ve döngü devam eder.",
    whyTrack:
      "Agent'ların 'gerçek iş' yapabilmesi için GUI otomasyonu kritik bir adımdır. Computer use yetenekleri hızla gelişiyor; güvenilirlik, hız ve desteklenen ortamlar takip edilmeye değer.",
    examples:
      "Bir web formunu doldurmak, e-ticaret sitesinde ürün aramak, Excel'de hücre düzenlemek veya eski bir kurumsal uygulamada rapor çekmek.",
    keywords: ["computer use", "computer-use", "browser use", "gui agent"],
    researchQuery: "computer use gui agent",
    accent: "orange",
  },
  context_compaction: {
    slug: "context_compaction",
    title: "Context Compaction",
    subtitle: "Context Optimization",
    shortDescription:
      "Uzun konuşma ve agent görevlerinde bağlamı küçülterek token maliyetini düşürür.",
    purpose:
      "Uzun konuşma ve agent görevlerinde context'i küçülterek token kullanımını azaltır.",
    latestDevelopment: "Uzun oturumlarda özetleme ve sıkıştırma teknikleri ürünleşiyor.",
    whyImportant: "Maliyet ve bağlam limiti sorununu uzun görevlerde hafifletir.",
    whatIs: [
      "Context compaction, uzayan sohbet geçmişini veya agent oturumundaki birikmiş bilgiyi özetleyerek, sıkıştırarak veya gereksiz kısımları atarak modele daha az token ile aktarmayı amaçlar. 200K token'lık bir oturum 20K'ya indirilebilir.",
      "Agent görevleri uzadıkça bağlam hızla şişer: okunan dosyalar, araç çıktıları, hata mesajları birikir. Compaction olmadan maliyet patlar veya bağlam penceresi taşar.",
    ],
    howItWorks:
      "Periyodik olarak eski mesajlar özetlenir; tekrarlayan araç çıktıları birleştirilir; kritik olmayan detaylar atılır. Bazı sistemler 'memory' katmanı kullanır: önemli bilgiler ayrı tutulur, geri kalanı sıkıştırılır.",
    whyTrack:
      "Uzun agent oturumları production'da yaygınlaştıkça compaction pratik bir zorunluluk. Anthropic, OpenAI ve agent framework'lerinde yeni compaction yaklaşımları sık duyuruluyor.",
    examples:
      "2 saatlik coding agent oturumunda önceki dosya okumalarının özetlenmesi; 50 tur süren müşteri desteği sohbetinde eski mesajların sıkıştırılması.",
    keywords: ["context compaction", "compaction", "memory"],
    researchQuery: "context compaction llm",
    accent: "green",
  },
  multimodal: {
    slug: "multimodal",
    title: "Multimodal",
    subtitle: "Çok Modlu Modeller",
    shortDescription:
      "Metin, görüntü, ses ve videoyu birlikte anlayabilen modeller.",
    purpose: "Metin, görüntü, ses ve videoyu birlikte anlayabilir.",
    latestDevelopment: "Görüntü ve video anlama yetenekleri yeni model sürümlerine ekleniyor.",
    whyImportant: "Tek modaliteye bağlı kalmadan daha zengin uygulamalar mümkün.",
    whatIs: [
      "Multimodal AI, yalnızca metin değil; görüntü, ses, video ve bazen tablo veya kod gibi farklı veri türlerini aynı modelde işleyebilen sistemlerdir. GPT-4o, Gemini, Claude 3+ gibi modeller fotoğraf gönderildiğinde ne olduğunu anlayabilir.",
      "Bu yetenek chatbot'u 'gören ve duyan' bir asistana dönüştürür. Görsel soru-cevap, video özeti, OCR, diyagram yorumlama gibi görevler multimodal modellerin alanıdır.",
    ],
    howItWorks:
      "Farklı modaliteler önce ayrı encoder'larla vektörlere dönüştürülür, sonra ortak bir dil modeli katmanında birleştirilir. Model metin + görüntü birlikte geldiğinde ikisini de dikkate alarak cevap üretir.",
    whyTrack:
      "Neredeyse her büyük model duyurusu multimodal yetenek genişlemesi içeriyor. Vision, audio ve video anlama kalitesindeki sıçramalar yeni uygulama alanları açıyor.",
    examples:
      "Bir grafik fotoğrafını yorumlatmak, el yazısı fotoğrafından metin çıkarmak, toplantı kaydından özet almak veya ürün görseline göre açıklama yazmak.",
    keywords: ["multimodal", "vision", "image input", "video"],
    researchQuery: "multimodal large language model",
    accent: "pink",
  },
  open_weights: {
    slug: "open_weights",
    title: "Open Weights",
    subtitle: "Açık Ağırlıklı Modeller",
    shortDescription:
      "Model ağırlıklarının indirilebilir ve özelleştirilebilir şekilde paylaşılması.",
    purpose: "Model ağırlıklarının açık veya kısıtlı lisansla paylaşılması.",
    latestDevelopment: "Yeni açık ağırlıklı modeller ve lisans güncellemeleri yayımlanıyor.",
    whyImportant: "Özelleştirme, şeffaflık ve yerel dağıtım seçeneklerini genişletir.",
    whatIs: [
      "Open weights, bir dil modelinin eğitilmiş ağırlık dosyalarının (checkpoint) topluluk veya kurumların indirip inceleyebileceği, fine-tune edebileceği ve kendi sunucularında çalıştırabileceği şekilde paylaşılmasıdır. 'Açık kaynak yazılım'ın model dünyasındaki karşılığıdır.",
      "Llama, Mistral, Qwen, DeepSeek gibi modeller open weights kategorisindedir. Lisanslar değişir: bazıları ticari kullanıma izin verir, bazıları kısıtlıdır. Kapalı modeller (GPT-4, Claude) yalnızca API üzerinden erişilebilir.",
    ],
    howItWorks:
      "Model eğitildikten sonra ağırlık dosyaları Hugging Face gibi platformlarda yayımlanır. Geliştiriciler bu dosyaları indirip kendi donanımlarında çalıştırır, veri setleriyle fine-tune eder veya distillation yapar.",
    whyTrack:
      "Açık ve kapalı ekosistem arasındaki güç dengesi AI pazarını şekillendiriyor. Yeni open weights duyuruları, lisans değişiklikleri ve performans sıçramaları stratejik önem taşır.",
    examples:
      "Llama 3'ü kendi sunucuda çalıştırmak, Mistral'ı Türkçe veriyle fine-tune etmek veya Qwen'i mobil cihaza sıkıştırmak.",
    keywords: ["open weights", "open-weight", "open source model"],
    researchQuery: "open weights language model",
    accent: "amber",
  },
};

const BRAND_DISPLAY: Record<string, string> = {
  openai: "GPT",
  anthropic: "Claude",
  google: "Gemini",
  deepmind: "Gemini",
  meta: "Llama",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  alibaba: "Qwen",
  nvidia: "NVIDIA",
  xai: "Grok",
};

export type TrendStatus = "rising" | "stable" | "falling";

export function matchTechnology(text: string, slug: TechnologySlug): boolean {
  const copy = TECHNOLOGY_COPY[slug];
  const haystack = text.toLowerCase();
  return copy.keywords.some(kw => haystack.includes(kw.toLowerCase()));
}

export function eventMatchesSlug<T extends { title: string; new_value?: Record<string, unknown> | null }>(
  event: T,
  slug: TechnologySlug,
): boolean {
  return matchTechnology(`${event.title} ${JSON.stringify(event.new_value ?? {})}`, slug);
}

export function countMatchingEvents<T extends { title: string; detected_at: string; new_value?: Record<string, unknown> | null }>(
  events: T[],
  slug: TechnologySlug,
  sinceMs: number,
  untilMs = Date.now(),
): number {
  return events.filter(event => {
    const ts = new Date(event.detected_at).getTime();
    if (ts < sinceMs || ts > untilMs) return false;
    return eventMatchesSlug(event, slug);
  }).length;
}

export function dailyBuckets<T extends { title: string; detected_at: string; new_value?: Record<string, unknown> | null }>(
  events: T[],
  slug: TechnologySlug,
  days: number,
): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const now = Date.now();
  for (const event of events) {
    if (!eventMatchesSlug(event, slug)) continue;
    const ts = new Date(event.detected_at).getTime();
    const dayIndex = Math.floor((now - ts) / 86_400_000);
    if (dayIndex >= 0 && dayIndex < days) {
      buckets[days - 1 - dayIndex] += 1;
    }
  }
  return buckets;
}

export function growthPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function trendStatus(growth: number): TrendStatus {
  if (growth >= 8) return "rising";
  if (growth <= -8) return "falling";
  return "stable";
}

export function trendLabel(status: TrendStatus): string {
  if (status === "rising") return "Yükselişte";
  if (status === "falling") return "Düşüşte";
  return "Stabil";
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export function relatedBrandsFromEvents<T extends { title: string; new_value?: Record<string, unknown> | null; evidence?: { source?: string } | null }>(
  events: T[],
  slug: TechnologySlug,
  limit = 6,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const event of events) {
    if (!eventMatchesSlug(event, slug)) continue;
    const source = event.evidence?.source?.toLowerCase() ?? "";
    const text = `${event.title} ${source}`;
    for (const [key, label] of Object.entries(BRAND_DISPLAY)) {
      if (seen.has(label)) continue;
      if (text.toLowerCase().includes(key) || new RegExp(`\\b${key}\\b`, "i").test(event.title)) {
        seen.add(label);
        result.push(label);
      }
    }
    if (result.length >= limit) break;
  }
  if (result.length === 0) return ["Claude", "GPT", "Gemini"];
  return result;
}

export function latestEventTitle<T extends { title: string; detected_at: string; new_value?: Record<string, unknown> | null }>(
  events: T[],
  slug: TechnologySlug,
): string | null {
  for (const event of events) {
    if (eventMatchesSlug(event, slug)) {
      return event.title.replace(/: (input|output|cache_read|cache_write)_per_1m_tokens changed$/i, "").trim();
    }
  }
  return null;
}

export const ACCENT_COLORS: Record<TechnologyAccent, { main: string; soft: string; glow: string }> = {
  green: { main: "#6e961a", soft: "#6e961a33", glow: "#6e961a55" },
  purple: { main: "#9b6dff", soft: "#9b6dff33", glow: "#9b6dff55" },
  blue: { main: "#4da3ff", soft: "#4da3ff33", glow: "#4da3ff55" },
  orange: { main: "#ff9f43", soft: "#ff9f4333", glow: "#ff9f4355" },
  teal: { main: "#3ecfba", soft: "#3ecfba33", glow: "#3ecfba55" },
  pink: { main: "#ff6b9d", soft: "#ff6b9d33", glow: "#ff6b9d55" },
  amber: { main: "#f5c542", soft: "#f5c54233", glow: "#f5c54255" },
  cyan: { main: "#45d1ff", soft: "#45d1ff33", glow: "#45d1ff55" },
};
