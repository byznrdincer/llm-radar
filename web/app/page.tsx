"use client";
import { useEffect, useState } from "react";
import ProductInsights from "./components/ProductInsights";
import type { InsightsView } from "./components/ProductInsights";
import LeaderboardPage from "./components/LeaderboardPage";
import ModelCatalogPage from "./components/ModelCatalogPage";
import SmartModelComparison from "./components/SmartModelComparison";
import FeedbackPage from "./components/FeedbackPage";
import EventsPage from "./components/EventsPage";
import ResearchPage, { type ResearchBootstrap } from "./components/ResearchPage";
import TechnologyRadarPage from "./components/TechnologyRadarPage";
import SourcesPage from "./components/SourcesPage";
import ModelDetailDrawer from "./components/ModelDetailDrawer";
import OverviewIntelligence from "./components/OverviewIntelligence";
import LanguageToggle from "./components/LanguageToggle";
import { useLanguage } from "./lib/i18n";
import type { TurkishModel } from "./components/TurkishLLMPage";
import { useLeaderboardData } from "./lib/useLeaderboardData";
import { useModelCatalog } from "./lib/useModelCatalog";
import { useModelDetail } from "./lib/useModelDetail";
import { useModelCompare } from "./lib/useModelCompare";
import { useSectionNav } from "./lib/useSectionNav";
import {
    emptyStats,
    type ModelItem,
    type TechnologyItem,
} from "./lib/catalogTypes";
import {
    BENCHMARK_INFO,
    SECTION_META,
    SIDEBAR_GROUPS,
    compact,
    insightViews,
    money,
    runtimeCapabilityOptions,
} from "./lib/homeContent";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const INITIAL_RESEARCH_LIMIT = 17;

export default function Home() {
    const { language, locale } = useLanguage();
    const sidebarGroups = SIDEBAR_GROUPS[language];
    const sectionMeta = SECTION_META[language];
    const benchmarkInfo = BENCHMARK_INFO[language];
    const moneyLabel = (value: string | null | undefined) => money(value, locale);
    const compactNumber = (value: number) => compact(value, locale);
    const [stats, setStats] = useState(emptyStats);
    const [models] = useState<ModelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [researchBootstrap, setResearchBootstrap] = useState<ResearchBootstrap | null>(null);
    const [turkishBootstrap, setTurkishBootstrap] = useState<TurkishModel[] | null>(null);
    const [technology, setTechnology] = useState<TechnologyItem[]>([]);
    const [benchmarkInfoOpen, setBenchmarkInfoOpen] = useState(false);
    const [eventCategory, setEventCategory] = useState("any");
    const [eventDays, setEventDays] = useState("1");

    const { activeSection, sidebarOpen, setSidebarOpen, navigateToSection } = useSectionNav("overview");
    const leaderboard = useLeaderboardData();
    const serverFiltering = activeSection === "models";
    const catalog = useModelCatalog({ enabled: serverFiltering, models, setError });
    const detail = useModelDetail(models);
    const compare = useModelCompare(setError);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        fetch(`${API}/api/v1/stats`, { signal })
            .then(r => r.json())
            .then(setStats)
            .catch(() => setError(true))
            .finally(() => setLoading(false));

        // Background: never block the catalog on these.
        fetch(`${API}/api/v1/research?limit=${INITIAL_RESEARCH_LIMIT}&offset=0`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.items) {
                    setResearchBootstrap({
                        items: data.items,
                        total: Number(data.total ?? 0),
                        summary: data.summary ?? null,
                        limit: Number(data.limit ?? INITIAL_RESEARCH_LIMIT),
                    });
                }
            })
            .catch(() => { /* optional */ });

        fetch(`${API}/api/v1/models/turkish?limit=200`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.items) setTurkishBootstrap(data.items as TurkishModel[]);
            })
            .catch(() => { /* optional */ });

        return () => controller.abort();
    }, []);
    useEffect(() => { fetch(`${API}/api/v1/technology`).then(r => r.ok ? r.json() : null).then(data => setTechnology(data?.items ?? [])).catch(() => { }); }, []);
    useEffect(() => { if (!benchmarkInfoOpen)
        return; const close = (event: KeyboardEvent) => { if (event.key === "Escape")
        setBenchmarkInfoOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [benchmarkInfoOpen]);

    const filtered = serverFiltering ? (catalog.profileResults ?? []) : models;
    const resultTotal = serverFiltering ? catalog.profileTotal : stats.models;
    const catalogHasMore = serverFiltering && filtered.length < resultTotal;
    const catalogBootReady = catalog.profileResults !== null;
    const visible = serverFiltering ? filtered : filtered.slice(0, 20);

    async function openDetail(model: { id: string }) {
        await detail.openDetail(model);
    }
    function closeDetail() {
        detail.closeDetail();
    }

    return <div className={`app-shell${activeSection === "leaderboard" ? " leaderboard-shell" : ""}`}>
    {(activeSection === "research" || activeSection === "radar" || activeSection === "sources") && <LanguageToggle />}
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label={language === "tr" ? "Ana navigasyon" : "Main navigation"}><button type="button" className="sidebar-brand" onClick={() => navigateToSection("overview")}><span className="brand-mark brand-radar" aria-hidden="true"><i /><b /><em /><em /><em /></span><span><strong>LLM RADAR</strong><small>MODEL INTELLIGENCE</small></span></button><nav className="sidebar-nav">{sidebarGroups.map(group => <div className="sidebar-group" key={group.label}><p>{group.label}</p>{group.items.map(item => <button type="button" key={item.id} className={activeSection === item.id ? "active" : ""} aria-current={activeSection === item.id ? "page" : undefined} onClick={() => navigateToSection(item.id)}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span></button>)}</div>)}</nav><div className="sidebar-status"><span /><div><strong>{language === "tr" ? "Veri akışı aktif" : "Data feed active"}</strong><small>{stats.models || "—"} {language === "tr" ? "model izleniyor" : "models tracked"}</small></div></div></aside>
    {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label={language === "tr" ? "Menüyü kapat" : "Close menu"} onClick={() => setSidebarOpen(false)}/>}
    {!sidebarOpen && <button className="sidebar-toast" type="button" aria-label={language === "tr" ? "Menüyü aç" : "Open menu"} onClick={() => setSidebarOpen(true)}><span className="sidebar-toast-mark brand-radar" aria-hidden="true"><i /><b /><em /><em /><em /></span><span className="sidebar-toast-label">{language === "tr" ? "Menü" : "Menu"}</span></button>}
    <main className={`main-content${activeSection === "leaderboard" ? " leaderboard-layout" : activeSection === "models" ? " catalog-layout" : activeSection === "turkish" ? " turkish-layout" : activeSection === "research" ? " rs-layout" : activeSection === "radar" ? " tr-layout" : activeSection === "sources" ? " sources-layout" : ""}`} id="top">
    {activeSection !== "research" && activeSection !== "radar" && activeSection !== "sources" && (
    <header className="topbar"><div className="topbar-context"><span>{sectionMeta[activeSection]?.group ?? "LLM Radar"}</span><strong>{sectionMeta[activeSection]?.title ?? (language === "tr" ? "Model ve benchmark görünümü" : "Model & benchmark view")}</strong></div><div className="topbar-right"><LanguageToggle inline /><div className="live-pill"><span /> {language === "tr" ? "CANLI" : "LIVE"}</div></div></header>
    )}
    <div className={`app-view${activeSection === "leaderboard" ? " app-view-leaderboard" : activeSection === "models" ? " app-view-catalog" : activeSection === "turkish" ? " app-view-turkish" : ""}`}>
    {activeSection === "overview" && <>
    <section className="hero" id="overview"><div><p className="eyebrow">LLM INTELLIGENCE PLATFORM</p><h1>{language === "tr" ? <>Yapay zekâ dünyasının<br /><em>nabzını tut.</em></> : <>Keep your finger<br /><em>on the pulse of AI.</em></>}</h1><p className="hero-copy">{language === "tr" ? "Modelleri, fiyatları ve teknoloji değişimlerini tek merkezden, kaynaklarıyla birlikte takip et." : "Track models, pricing, and technology shifts from one place, with sources attached."}</p></div><div className="radar"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="orbit orbit-three"/><span className="sweep"/><span className="dot dot-one"/><span className="dot dot-two"/><span className="dot dot-three"/><b>{stats.models || "—"}</b><small>{language === "tr" ? "İZLENEN MODEL" : "MODELS TRACKED"}</small></div></section>
    {error && <div className="error">{language === "tr" ? "API bağlantısı kurulamadı. Backend servisinin çalıştığını kontrol et." : "Could not connect to the API. Check that the backend service is running."}</div>}
    <section className="metric-grid">{[[language === "tr" ? "İzlenen model" : "Models tracked", stats.models], [language === "tr" ? "Takip edilen firma" : "Companies tracked", stats.companies], [language === "tr" ? "Fiyat gözlemi" : "Price observations", stats.price_observations], [language === "tr" ? "Tespit edilen olay" : "Events detected", stats.change_events]].map(([label, value]) => <article className="metric" key={String(label)}><p>{label}</p><strong>{loading ? "—" : compactNumber(Number(value))}</strong><span>● {language === "tr" ? "Güncel veri" : "Up to date"}</span></article>)}</section>
    <OverviewIntelligence
        api={API}
        onOpenLeaderboards={() => navigateToSection("leaderboard")}
        onOpenEvents={() => navigateToSection("events")}
    />
    </>}

    {activeSection === "leaderboard" && (
    <LeaderboardPage
        view={leaderboard.leaderboardView}
        onViewChange={leaderboard.selectLeaderboardView}
        boards={leaderboard.leaderboardBoards}
        benchmarkInfo={benchmarkInfo}
        onOpenInfo={() => setBenchmarkInfoOpen(true)}
        livebenchCategory={leaderboard.livebenchCategory}
        onLivebenchCategoryChange={value => { leaderboard.setLivebenchCategory(value); leaderboard.setLeaderboardView("livebench"); }}
        mmluCategory={leaderboard.mmluCategory}
        onMmluCategoryChange={leaderboard.setMmluCategory}
        sweLiveCategory={leaderboard.sweLiveCategory}
        onSweLiveCategoryChange={leaderboard.setSweLiveCategory}
        tauCategory={leaderboard.tauCategory}
        onTauCategoryChange={leaderboard.setTauCategory}
        onInspectModel={detail.inspectLeaderboardModel}
    />
    )}

    {activeSection === "models" && (
    <ModelCatalogPage
        loading={!catalogBootReady && loading}
        modelCount={stats.models}
        resultTotal={resultTotal}
        profileLoading={catalog.profileLoading}
        query={catalog.query}
        onQueryChange={value => { catalog.setQuery(value); catalog.setPage(1); }}
        developers={catalog.developers}
        onToggleDeveloper={catalog.toggleDeveloper}
        onClearDevelopers={() => { catalog.setDevelopers([]); catalog.setPage(1); }}
        companies={catalog.companies}
        advancedOpen={catalog.advancedOpen}
        onAdvancedToggle={() => catalog.setAdvancedOpen(open => !open)}
        advancedActive={catalog.advancedActive}
        sortStack={catalog.sortStack}
        onSort={catalog.changeSort}
        sortLabels={catalog.sortLabels}
        activeFilters={catalog.activeModelFilters}
        onResetFilters={catalog.resetAdvanced}
        facets={catalog.facets}
        minContext={catalog.minContext}
        onMinContextChange={value => { catalog.setMinContext(value); catalog.setPage(1); }}
        maxInputPrice={catalog.maxInputPrice}
        onMaxInputPriceChange={value => { catalog.setMaxInputPrice(value); catalog.setPage(1); }}
        maxOutputPrice={catalog.maxOutputPrice}
        onMaxOutputPriceChange={value => { catalog.setMaxOutputPrice(value); catalog.setPage(1); }}
        providers={catalog.providers}
        onToggleProvider={catalog.toggleProvider}
        onClearProviders={() => { catalog.setProviders([]); catalog.setPage(1); }}
        openness={catalog.openness}
        licenses={catalog.licenses}
        commercialStatuses={catalog.commercialStatuses}
        modalities={catalog.modalities}
        capabilities={catalog.capabilities}
        families={catalog.families}
        advancedness={catalog.advancedness}
        onToggleAdvancedness={catalog.toggleAdvancedness}
        onClearAdvancedness={() => { catalog.setAdvancedness([]); catalog.setPage(1); }}
        benchmarkFocus={catalog.benchmarkFocus}
        onBenchmarkFocusChange={value => { catalog.setBenchmarkFocus(value); catalog.setPage(1); }}
        onToggleOpenness={value => catalog.toggleList(value, catalog.setOpenness)}
        onToggleLicense={value => catalog.toggleList(value, catalog.setLicenses)}
        onToggleCommercial={value => catalog.toggleList(value, catalog.setCommercialStatuses)}
        onToggleModality={catalog.toggleModality}
        onToggleCapability={catalog.toggleCapability}
        onToggleFamily={value => catalog.toggleList(value, catalog.setFamilies)}
        runtimeCapabilityOptions={runtimeCapabilityOptions}
        trModality={catalog.trModalityLabel}
        trCapability={catalog.trCapabilityLabel}
        models={visible}
        selectedIds={compare.selected.map(item => item.id)}
        onToggleSelect={compare.toggle}
        onInspect={openDetail}
        hasMore={catalogHasMore}
        loadingMore={catalog.profileLoading && catalog.page > 1}
        onLoadMore={() => { if (catalogHasMore && !catalog.profileLoading) catalog.setPage(current => current + 1); }}
        money={moneyLabel}
        developerSites={catalog.developerSites}
    />
    )}

    {activeSection === "compare" && (
    <section className="compare-section app-page" id="compare">
        <div className="section-title compare-title-row">
            <div>
                <p className="kicker">{language === "tr" ? "MODEL KARŞILAŞTIRMA" : "MODEL COMPARISON"}</p>
                <h2>{language === "tr" ? "Akıllı model karşılaştırması." : "Smart model comparison."}</h2>
            </div>
            <p>{language === "tr" ? "Katalogdan en fazla 3 model seç; fiyat, context, benchmark, yetenekler ve kullanım senaryosuna göre öneri al." : "Pick up to 3 models from the catalog and get recommendations based on price, context, benchmarks, capabilities, and use case."}</p>
            <button type="button" className="compare-catalog-btn" onClick={() => navigateToSection("models")}>◫ {language === "tr" ? "Model kataloğundan seç" : "Pick from the model catalog"}</button>
        </div>
        {compare.selected.length === 0 ? (
            <div className="compare-empty">
                <p>{language === "tr" ? "Karşılaştırmak istediğin modelleri katalogdan seç." : "Pick the models you want to compare from the catalog."}</p>
                <p className="compare-empty-hint">{language === "tr" ? <>Tablodaki <strong>+</strong> düğmesiyle model ekle; en az 2 model seçince akıllı özet ve senaryo önerileri açılır.</> : <>Add models with the <strong>+</strong> button in the table; pick at least 2 to unlock the smart summary and scenario recommendations.</>}</p>
                <button type="button" className="compare-catalog-btn compare-catalog-btn-large" onClick={() => navigateToSection("models")}>{language === "tr" ? "Model kataloğuna git" : "Go to model catalog"}</button>
            </div>
        ) : (
            <>
                <div className="compare-toolbar">
                    <p><strong>{compare.selected.length}</strong> / 3 {language === "tr" ? "model seçildi" : "models selected"}</p>
                    <button type="button" className="compare-catalog-btn" onClick={() => navigateToSection("models")}>+ {language === "tr" ? "Model ekle / değiştir" : "Add / change model"}</button>
                </div>
                {compare.selected.length < 2 ? (
                    <div className="compare-hint">{language === "tr" ? <>Akıllı karşılaştırma için bir model daha seç. Katalogdaki <strong>+</strong> düğmesini kullanabilirsin.</> : <>Pick one more model for the smart comparison. You can use the <strong>+</strong> button in the catalog.</>}</div>
                ) : (
                    <SmartModelComparison models={compare.selected} profiles={compare.compareProfiles} developerSites={catalog.developerSites} onRemove={compare.toggle} onInspect={openDetail} />
                )}
            </>
        )}
    </section>
    )}

    {insightViews.has(activeSection as InsightsView) && (
    <ProductInsights
        api={API}
        view={activeSection as InsightsView}
        onNavigate={navigateToSection}
        turkishBootstrap={turkishBootstrap}
        onOpenWeight={() => {
            catalog.setOpenness(["open_weight"]);
            catalog.setPage(1);
            catalog.setAdvancedOpen(true);
            navigateToSection("models");
        }}
    />
    )}

    {activeSection === "events" && (
    <EventsPage
        api={API}
        category={eventCategory}
        days={eventDays}
        onCategoryChange={setEventCategory}
        onDaysChange={setEventDays}
    />
    )}

    {activeSection === "research" && (
    <ResearchPage api={API} bootstrap={researchBootstrap} />
    )}

    {activeSection === "radar" && (
    <TechnologyRadarPage
        api={API}
        signals={technology}
        onViewAllEvents={() => navigateToSection("events")}
    />
    )}

    {activeSection === "sources" && (
    <SourcesPage api={API} />
    )}

    {activeSection === "feedback" && (
    <FeedbackPage api={API}/>
    )}

    </div>

    {activeSection !== "leaderboard" && activeSection !== "models" && activeSection !== "turkish" && activeSection !== "events" && activeSection !== "research" && activeSection !== "radar" && activeSection !== "sources" && <footer className="site-foot"><span>LLM RADAR / 2026</span><span>{language === "tr" ? "OpenRouter kaynaklı • Yakın gerçek zamanlı takip" : "Sourced via OpenRouter • Near real-time tracking"}</span></footer>}
    {benchmarkInfoOpen && <div className="benchmark-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget)
        setBenchmarkInfoOpen(false); }}><section className="benchmark-info-modal" role="dialog" aria-modal="true" aria-labelledby="benchmark-info-title"><button type="button" className="benchmark-modal-close" aria-label={language === "tr" ? "Benchmark açıklamasını kapat" : "Close benchmark explanation"} onClick={() => setBenchmarkInfoOpen(false)}>×</button><p className="kicker">{language === "tr" ? "BENCHMARK REHBERİ" : "BENCHMARK GUIDE"}</p><h2 id="benchmark-info-title">{benchmarkInfo[leaderboard.leaderboardView].name}</h2><p>{benchmarkInfo[leaderboard.leaderboardView].summary}</p><dl><div><dt>{language === "tr" ? "Ne ölçüyor?" : "What does it measure?"}</dt><dd>{benchmarkInfo[leaderboard.leaderboardView].measure}</dd></div><div><dt>{language === "tr" ? "Nasıl okunmalı?" : "How should it be read?"}</dt><dd>{benchmarkInfo[leaderboard.leaderboardView].reading}</dd></div></dl></section></div>}

    <ModelDetailDrawer
      loading={detail.detailLoading}
      model={detail.detail}
      missing={detail.detailMissing}
      isCompared={Boolean(detail.detail && compare.selected.some(item => item.id === detail.detail!.id))}
      compareDisabled={Boolean(detail.detail && compare.selected.length >= 3 && !compare.selected.some(item => item.id === detail.detail!.id))}
      onClose={closeDetail}
      onToggleCompare={() => { if (detail.detail) compare.toggle(detail.detail); }}
      onOpenCatalog={() => {
        if (!detail.detail) return;
        catalog.setQuery(detail.detail.name);
        catalog.setPage(1);
        closeDetail();
        navigateToSection("models");
      }}
    />
    </main>
  </div>;
}
