"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "tr" | "en";

const STORAGE_KEY = "llm-radar-language";

type LanguageContextValue = {
    language: Language;
    setLanguage: (language: Language) => void;
    toggleLanguage: () => void;
    locale: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
    if (typeof window === "undefined") return "tr";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "tr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>("tr");

    useEffect(() => {
        setLanguageState(readStoredLanguage());
    }, []);

    useEffect(() => {
        if (typeof document !== "undefined") document.documentElement.lang = language;
    }, [language]);

    function setLanguage(next: Language) {
        setLanguageState(next);
        if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
    }

    function toggleLanguage() {
        setLanguage(language === "tr" ? "en" : "tr");
    }

    const value = useMemo<LanguageContextValue>(
        () => ({ language, setLanguage, toggleLanguage, locale: language === "tr" ? "tr-TR" : "en-US" }),
        [language],
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
    return ctx;
}
