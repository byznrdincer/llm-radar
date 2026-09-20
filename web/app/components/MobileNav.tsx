"use client";
import { useEffect, useState } from "react";
import LanguageToggle from "./LanguageToggle";
import { useLanguage } from "../lib/i18n";
import {
    MOBILE_NAV_COPY,
    MOBILE_PRIMARY_SECTIONS,
    MOBILE_TAB_LABELS,
    SECTION_META,
    SIDEBAR_GROUPS,
} from "../lib/homeContent";

/** Phone shell for the SPA: compact header, bottom tab bar, and a sheet holding
 * every section that does not fit into the five primary tabs. Hidden above 900px,
 * where the sidebar takes over. */
export default function MobileNav({
    activeSection,
    onNavigate,
}: {
    activeSection: string;
    onNavigate: (id: string) => void;
}) {
    const { language } = useLanguage();
    const [sheetOpen, setSheetOpen] = useState(false);
    const copy = MOBILE_NAV_COPY[language];
    const tabLabels = MOBILE_TAB_LABELS[language];
    const groups = SIDEBAR_GROUPS[language];
    const meta = SECTION_META[language][activeSection];

    const allItems = groups.flatMap(group => group.items);
    const tabs = MOBILE_PRIMARY_SECTIONS.map(id => allItems.find(item => item.id === id)).filter(item => item != null);
    const moreGroups = groups
        .map(group => ({ label: group.label, items: group.items.filter(item => !MOBILE_PRIMARY_SECTIONS.includes(item.id)) }))
        .filter(group => group.items.length > 0);
    const moreActive = !MOBILE_PRIMARY_SECTIONS.includes(activeSection);

    useEffect(() => {
        if (!sheetOpen) return;
        const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSheetOpen(false); };
        // The sheet only exists below 900px; if the viewport grows past the
        // breakpoint it would be hidden with the page still scroll-locked.
        const desktop = window.matchMedia("(min-width:901px)");
        const closeOnDesktop = () => { if (desktop.matches) setSheetOpen(false); };
        const root = document.documentElement;
        const previousOverflow = root.style.overflow;
        root.style.overflow = "hidden";
        window.addEventListener("keydown", close);
        desktop.addEventListener("change", closeOnDesktop);
        return () => {
            root.style.overflow = previousOverflow;
            window.removeEventListener("keydown", close);
            desktop.removeEventListener("change", closeOnDesktop);
        };
    }, [sheetOpen]);

    function go(id: string) {
        setSheetOpen(false);
        onNavigate(id);
    }

    return <>
        <header className="mobile-topbar">
            <button type="button" className="mobile-topbar-home" aria-label={copy.home} onClick={() => go("overview")}>
                <span className="brand-mark brand-radar" aria-hidden="true"><i /><b /><em /><em /><em /></span>
            </button>
            <div className="mobile-topbar-title">
                <span>{meta?.group ?? "LLM RADAR"}</span>
                <strong>{meta?.title ?? "LLM Radar"}</strong>
            </div>
            <LanguageToggle inline />
        </header>

        <nav className="mobile-tabbar" aria-label={copy.tabs}>
            {tabs.map(item => (
                <button
                    type="button"
                    key={item.id}
                    className={activeSection === item.id && !sheetOpen ? "active" : ""}
                    aria-current={activeSection === item.id ? "page" : undefined}
                    onClick={() => go(item.id)}
                >
                    <i aria-hidden="true">{item.icon}</i>
                    <span>{tabLabels[item.id] ?? item.label}</span>
                </button>
            ))}
            <button
                type="button"
                className={moreActive || sheetOpen ? "active" : ""}
                aria-expanded={sheetOpen}
                aria-haspopup="dialog"
                onClick={() => setSheetOpen(open => !open)}
            >
                <i aria-hidden="true">⋯</i>
                <span>{tabLabels.more}</span>
            </button>
        </nav>

        {sheetOpen && (
            <div className="mobile-sheet-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSheetOpen(false); }}>
                <section className="mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title">
                    <div className="mobile-sheet-head">
                        <div>
                            <p id="mobile-sheet-title">{copy.moreTitle}</p>
                            <small>{copy.moreLead}</small>
                        </div>
                        <button type="button" aria-label={copy.close} onClick={() => setSheetOpen(false)}>×</button>
                    </div>
                    <div className="mobile-sheet-body">
                        {moreGroups.map(group => (
                            <div className="mobile-sheet-group" key={group.label}>
                                <p>{group.label}</p>
                                <div>
                                    {group.items.map(item => (
                                        <button
                                            type="button"
                                            key={item.id}
                                            className={activeSection === item.id ? "active" : ""}
                                            aria-current={activeSection === item.id ? "page" : undefined}
                                            onClick={() => go(item.id)}
                                        >
                                            <i aria-hidden="true">{item.icon}</i>
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        )}
    </>;
}
