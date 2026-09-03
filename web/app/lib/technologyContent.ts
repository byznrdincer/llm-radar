import type { Language } from "./i18n";

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
  /** Detail page — a few paragraphs */
  whatIs: string[];
  howItWorks: string;
  whyTrack: string;
  examples: string;
  keywords: string[];
  researchQuery: string;
  accent: TechnologyAccent;
};

/** Mockup: featured this week */
export const FEATURED_SLUGS: TechnologySlug[] = ["mcp", "agent", "context_compaction"];

/** Technologies outside the featured set — plain list */
export const GRID_SLUGS: TechnologySlug[] = [
  "moe",
  "reasoning",
  "computer_use",
  "model_routing",
  "multimodal",
  "open_weights",
];

export const TECHNOLOGY_COPY: Record<Language, Record<TechnologySlug, TechnologyCopy>> = {
  tr: {
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
  },
  en: {
    agent: {
      slug: "agent",
      title: "Agentic AI",
      subtitle: "Agent Frameworks",
      shortDescription:
        "Lets a model plan and use tools to complete a task from start to finish.",
      purpose:
        "Enables the model to plan, use tools, and complete a task instead of just answering.",
      latestDevelopment:
        "Coding and computer-use agents are starting to carry out longer tasks independently.",
      whyImportant:
        "LLMs are moving beyond chatbots into systems that get real work done.",
      whatIs: [
        "An AI agent is a setup that lets a language model go beyond producing a single answer — it works step by step toward a goal. The model first plans what it needs to do, then reads files, runs code, or searches the web as needed, evaluates the result, and moves to the next step.",
        "This is what sets it apart from a classic chatbot: the user doesn't have to spell out every step. The agent sets its own intermediate goals and can change strategy when something fails. That's why agents are used for multi-step work like coding, data analysis, and customer-support automation.",
      ],
      howItWorks:
        "The typical flow: the user gives a goal → the model builds a plan → it calls the tools the plan calls for (terminal, browser, API) → it reads each step's output → it continues until the goal is met or a limit is reached. Claude Code, OpenAI Codex, and similar products work this way.",
      whyTrack:
        "Agent capabilities are maturing fast. Seeing early which models are moving into real workflows, and which task types they're reliable at, directly shapes product and infrastructure decisions. Progress in coding and computer-use in particular is the clearest sign of LLMs turning from 'talking assistants' into 'systems that do the work.'",
      examples:
        "Reading a GitHub issue and writing a patch, analyzing spreadsheet data and producing a report, finding a meeting slot on a calendar and sending an invite, or filling out a form on a website are all examples of agent scenarios.",
      keywords: ["agent", "agentic", "tool use", "tool calling"],
      researchQuery: "ai agent tool use",
      accent: "green",
    },
    mcp: {
      slug: "mcp",
      title: "MCP",
      subtitle: "Model Context Protocol",
      shortDescription:
        "Lets AI agents connect to tools like files, databases, and GitHub through one shared protocol.",
      purpose:
        "Lets AI agents connect to files, databases, GitHub, and other tools in a standard way.",
      latestDevelopment:
        "New MCP servers and enterprise integrations keep shipping.",
      whyImportant:
        "Can cut down the need to build a separate integration for every tool.",
      whatIs: [
        "The Model Context Protocol (MCP) is an open standard defining how AI applications connect to external tools and data sources. Much like USB makes it easy to plug different devices into the same port, MCP aims to let different AI clients reach different data sources through the same method.",
        "Championed by Anthropic, the protocol provides access to resources like file systems, databases, GitHub, Slack, and enterprise systems through small connectors called 'MCP servers.' That means each AI application doesn't need to build its integrations from scratch.",
      ],
      howItWorks:
        "An MCP server exposes access to a specific resource (say, PostgreSQL or a GitHub repo). The AI client (Cursor, Claude Desktop, etc.) connects to that server and tells the model which tools are available. The model reads data or performs actions through the server whenever it needs to.",
      whyTrack:
        "Tool integration is the biggest friction point in the agent ecosystem. MCP aims to fix that by standardizing it; how fast new servers and enterprise integrations are multiplying is an early signal of whether the protocol is actually catching on.",
      examples:
        "Cursor accessing a codebase, an agent pulling a document from Notion, or running a live database query all become possible through MCP servers.",
      keywords: ["mcp", "model context protocol"],
      researchQuery: "model context protocol",
      accent: "green",
    },
    model_routing: {
      slug: "model_routing",
      title: "Model Routing",
      subtitle: "Request Routing",
      shortDescription:
        "Routes every request to the right model to balance quality, speed, and cost.",
      purpose:
        "Picks the best model for each task instead of sending every request to the same one.",
      latestDevelopment:
        "Routing methods that weigh quality, speed, and cost together are becoming more common.",
      whyImportant:
        "Can cut cost by reserving pricier models for when they're actually needed.",
      whatIs: [
        "Model routing is a smart layer that, instead of sending every incoming request to one large model, picks the most suitable model based on the request's difficulty and requirements. Simple questions can go to a cheap, fast model, while tasks that need complex reasoning can go to a stronger (and pricier) one.",
        "Gateways like OpenRouter and LiteLLM use this approach widely in production. The goal is to cut cost while preserving the user experience.",
      ],
      howItWorks:
        "The router analyzes the request — estimating difficulty from length, topic, prior context, or a classifier model's score. It then picks the target model based on predefined rules or a learned policy. Some systems monitor response quality and update the routing strategy over time.",
      whyTrack:
        "As LLM costs keep growing, routing is one of the most practical optimization tools available. New methods appearing in the quality-speed-cost triangle are worth following to understand which approaches actually work.",
      examples:
        "A simple translation request goes to a small model, a legal-document analysis goes to a large one. In some systems, 'thinking' mode only kicks in for hard questions.",
      keywords: ["router", "model routing", "mixture of models"],
      researchQuery: "llm model routing",
      accent: "teal",
    },
    reasoning: {
      slug: "reasoning",
      title: "Reasoning",
      subtitle: "Chain of Thought",
      shortDescription:
        "Lets a model think longer and verify its own answer on hard problems.",
      purpose: "Does more thinking and verification on hard problems.",
      latestDevelopment: "Long-form thinking and self-verification steps are being added to new models.",
      whyImportant: "Can boost accuracy on math, code, and planning tasks.",
      whatIs: [
        "Reasoning models are systems that let the model 'think' first — producing intermediate steps, checklists, or an inner monologue — instead of printing an answer right away. Chain-of-thought is the best-known method: the model breaks the problem into steps, explains each one, then reaches a conclusion.",
        "Models like OpenAI o1/o3, DeepSeek R1, and Claude extended thinking turn this approach into a product. The thinking process can be shown to the user or hidden; the goal is a more consistent, more accurate result.",
      ],
      howItWorks:
        "When the model gets a question, it first produces reasoning tokens (inner thought). These tokens aren't part of the answer, but they improve the final answer's quality. Some systems do self-verification: after producing an answer, they check it and correct it if they find an error.",
      whyTrack:
        "Reasoning ability is what separates models on benchmark leaderboards and in real-world use. New reasoning techniques and models are appearing fast; it matters to tell which ones actually work.",
      examples:
        "Math olympiad problems, debugging complex code, logic puzzles, and multi-step planning tasks are all areas where reasoning models excel.",
      keywords: ["reasoning", "chain of thought", "thinking"],
      researchQuery: "llm reasoning chain of thought",
      accent: "blue",
    },
    moe: {
      slug: "moe",
      title: "MoE",
      subtitle: "Mixture of Experts",
      shortDescription:
        "Runs only the needed expert parts of a giant model per token, instead of the whole thing.",
      purpose: "Runs only the expert parts needed for each token instead of the whole model.",
      latestDevelopment: "Larger MoE architectures are shipping with a lower active-parameter cost.",
      whyImportant: "Can deliver large capacity with more efficient compute.",
      whatIs: [
        "Mixture of Experts (MoE) is a model architecture made up of many 'expert' sub-networks instead of one giant network. Only a handful of experts activate for each token processed; the rest stay idle. That lets the total parameter count be very high while inference cost stays low.",
        "Mixtral, DeepSeek-V3, and some GPT-4-class models use MoE architecture. A '400B parameter' headline can be misleading — the number of parameters actually active at once is much smaller.",
      ],
      howItWorks:
        "A router (gate) picks which experts activate for each token. The chosen experts process that token, and their outputs are combined. During training, experts can specialize in different areas (code, math, general language).",
      whyTrack:
        "MoE is the main way to deliver large model capacity at cheaper inference cost. New open- and closed-weight MoE models keep shipping frequently; architecture choices show where the market is heading.",
      examples:
        "Mixtral 8x7B, DeepSeek-MoE, and similar models: billions of parameters in total, but far less compute per token.",
      keywords: ["moe", "mixture of experts", "mixture-of-experts"],
      researchQuery: "mixture of experts language model",
      accent: "purple",
    },
    computer_use: {
      slug: "computer_use",
      title: "Computer Use",
      subtitle: "GUI Automation",
      shortDescription:
        "Lets AI see the screen and click, type, and use apps.",
      purpose:
        "Lets AI understand the screen and click, type, and use applications.",
      latestDevelopment: "GUI agents can now complete longer automation tasks.",
      whyImportant: "Opens up new use cases in office and software automation.",
      whatIs: [
        "Computer use is an AI model's ability to read a screenshot or interface state and take actions — clicking, typing, scrolling — on a real computer or in a browser. The model uses a GUI (graphical interface) the way a person would.",
        "Anthropic's computer use feature, OpenAI Operator, and similar systems are pioneers in this space. They work through a visual interface rather than an API or terminal, which makes automation possible for legacy software and web applications.",
      ],
      howItWorks:
        "The model takes periodic screenshots, or reads the DOM/accessibility tree. It decides what to click and what to type. The action is performed, the new state is read, and the loop continues.",
      whyTrack:
        "GUI automation is a critical step toward agents doing 'real work.' Computer-use capabilities are advancing fast; reliability, speed, and supported environments are worth following.",
      examples:
        "Filling out a web form, searching for a product on an e-commerce site, editing a cell in Excel, or pulling a report from an old enterprise application.",
      keywords: ["computer use", "computer-use", "browser use", "gui agent"],
      researchQuery: "computer use gui agent",
      accent: "orange",
    },
    context_compaction: {
      slug: "context_compaction",
      title: "Context Compaction",
      subtitle: "Context Optimization",
      shortDescription:
        "Shrinks context in long conversations and agent tasks to cut token cost.",
      purpose:
        "Cuts token usage in long conversations and agent tasks by shrinking the context.",
      latestDevelopment: "Summarization and compression techniques for long sessions are becoming products.",
      whyImportant: "Eases the cost and context-limit problem in long-running tasks.",
      whatIs: [
        "Context compaction aims to pass less to the model by summarizing, compressing, or dropping unneeded parts of a growing chat history or an agent session's accumulated information. A 200K-token session can be brought down to 20K.",
        "As agent tasks run longer, context balloons fast: files read, tool outputs, and error messages pile up. Without compaction, cost explodes or the context window overflows.",
      ],
      howItWorks:
        "Older messages are periodically summarized; repeated tool outputs get merged; non-critical details are dropped. Some systems use a 'memory' layer: important information is kept separately while the rest gets compressed.",
      whyTrack:
        "As long agent sessions become common in production, compaction is a practical necessity. Anthropic, OpenAI, and agent frameworks frequently announce new compaction approaches.",
      examples:
        "Summarizing earlier file reads in a 2-hour coding-agent session; compressing older messages in a 50-turn customer-support conversation.",
      keywords: ["context compaction", "compaction", "memory"],
      researchQuery: "context compaction llm",
      accent: "green",
    },
    multimodal: {
      slug: "multimodal",
      title: "Multimodal",
      subtitle: "Multimodal Models",
      shortDescription:
        "Models that can understand text, images, audio, and video together.",
      purpose: "Can understand text, images, audio, and video together.",
      latestDevelopment: "Image and video understanding capabilities are being added to new model releases.",
      whyImportant: "Enables richer applications that aren't tied to a single modality.",
      whatIs: [
        "Multimodal AI refers to systems that can process not just text but also images, audio, video, and sometimes data types like tables or code within the same model. Models like GPT-4o, Gemini, and Claude 3+ can understand what's in a photo you send them.",
        "This capability turns a chatbot into an assistant that 'sees and hears.' Visual question-answering, video summarization, OCR, and diagram interpretation are all areas multimodal models handle.",
      ],
      howItWorks:
        "Different modalities are first turned into vectors by separate encoders, then combined in a shared language-model layer. When the model receives text and an image together, it generates an answer that accounts for both.",
      whyTrack:
        "Nearly every major model announcement now includes an expansion of multimodal capability. Leaps in vision, audio, and video understanding quality are opening up new application areas.",
      examples:
        "Interpreting a photo of a chart, extracting text from a photo of handwriting, summarizing a meeting recording, or writing a description based on a product photo.",
      keywords: ["multimodal", "vision", "image input", "video"],
      researchQuery: "multimodal large language model",
      accent: "pink",
    },
    open_weights: {
      slug: "open_weights",
      title: "Open Weights",
      subtitle: "Open-Weight Models",
      shortDescription:
        "Model weights shared in a form that can be downloaded and customized.",
      purpose: "Sharing a model's weights under an open or restricted license.",
      latestDevelopment: "New open-weight models and license updates keep shipping.",
      whyImportant: "Expands options for customization, transparency, and local deployment.",
      whatIs: [
        "Open weights means a language model's trained weight files (checkpoints) are shared in a way that communities or organizations can download, inspect, fine-tune, and run on their own servers. It's the model world's equivalent of 'open-source software.'",
        "Models like Llama, Mistral, Qwen, and DeepSeek fall into the open-weights category. Licenses vary: some allow commercial use, others are restricted. Closed models (GPT-4, Claude) are only accessible through an API.",
      ],
      howItWorks:
        "After a model is trained, its weight files are published on platforms like Hugging Face. Developers download these files and run them on their own hardware, fine-tune them with their own datasets, or perform distillation.",
      whyTrack:
        "The balance of power between the open and closed ecosystems is shaping the AI market. New open-weights announcements, license changes, and performance leaps carry strategic weight.",
      examples:
        "Running Llama 3 on your own server, fine-tuning Mistral on Turkish data, or compressing Qwen for a mobile device.",
      keywords: ["open weights", "open-weight", "open source model"],
      researchQuery: "open weights language model",
      accent: "amber",
    },
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
  const copy = TECHNOLOGY_COPY.tr[slug];
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

export function trendLabel(status: TrendStatus, language: Language = "tr"): string {
  if (language === "en") {
    if (status === "rising") return "Rising";
    if (status === "falling") return "Falling";
    return "Stable";
  }
  if (status === "rising") return "Yükselişte";
  if (status === "falling") return "Düşüşte";
  return "Stabil";
}

export function relativeTime(value: string | null | undefined, language: Language = "tr"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (language === "en") {
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  }
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
