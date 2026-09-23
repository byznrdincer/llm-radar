import { useEffect, useState } from "react";

/** Section switching via `#section` hash so external links can deep-link
 * (e.g. PlanetAI → https://llmradar.planetai9.com/#turkish). */
export function useSectionNav(initial: string) {
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window === "undefined") return initial;
    const hash = window.location.hash.replace(/^#/, "").trim();
    return hash || initial;
  });

  function navigateToSection(id: string) {
    setActiveSection(id);
    if (typeof window !== "undefined") {
      const next = `#${id}`;
      if (window.location.hash !== next) {
        window.history.replaceState(null, "", next);
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  useEffect(() => {
    function onHash() {
      const hash = window.location.hash.replace(/^#/, "").trim();
      if (hash) setActiveSection(hash);
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return { activeSection, navigateToSection };
}
