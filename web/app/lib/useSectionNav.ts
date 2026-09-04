import { useState } from "react";

/** Section switching: the app has no router - `activeSection` alone decides
 * which of page.tsx's top-level views is mounted. */
export function useSectionNav(initial: string) {
  const [activeSection, setActiveSection] = useState(initial);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function navigateToSection(id: string) {
    setActiveSection(id);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  return { activeSection, sidebarOpen, setSidebarOpen, navigateToSection };
}
