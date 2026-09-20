/** Prefer a direct PDF link when the research source exposes one. */

export function toResearchOpenUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return null;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.endsWith("arxiv.org")) return value;

    if (/\/pdf\//i.test(parsed.pathname)) {
      const id = parsed.pathname.split("/pdf/")[1]?.replace(/\/$/, "").replace(/\.pdf$/i, "");
      return id ? `https://arxiv.org/pdf/${id}.pdf` : value;
    }

    if (parsed.pathname.toLowerCase().endsWith(".pdf")) {
      return `https://arxiv.org${parsed.pathname}`;
    }

    const idMatch = parsed.pathname.match(/\/(?:abs|html|pdf)\/([^/?#]+)/i);
    if (idMatch?.[1]) {
      const id = idMatch[1].replace(/\.pdf$/i, "");
      return `https://arxiv.org/pdf/${id}.pdf`;
    }

    return value;
  } catch {
    return value;
  }
}
