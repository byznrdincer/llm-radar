"use client";
import { useLanguage } from "../lib/i18n";

export default function LanguageToggle() {
    const { language, setLanguage } = useLanguage();
    return (
        <div className="language-toggle" role="group" aria-label="Language / Dil">
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
