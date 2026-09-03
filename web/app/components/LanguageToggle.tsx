"use client";
import { useLanguage } from "../lib/i18n";

export default function LanguageToggle({ inline = false }: { inline?: boolean }) {
    const { language, setLanguage } = useLanguage();
    return (
        <div className={`language-toggle${inline ? " language-toggle-inline" : ""}`} role="group" aria-label="Language / Dil">
            <button
                type="button"
                className={language === "tr" ? "active" : ""}
                aria-pressed={language === "tr"}
                onClick={() => setLanguage("tr")}
            >
                TR
            </button>
            <button
                type="button"
                className={language === "en" ? "active" : ""}
                aria-pressed={language === "en"}
                onClick={() => setLanguage("en")}
            >
                EN
            </button>
        </div>
    );
}
