"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type TurkishModel = {
  id: string;
  name: string;
  organization: string;
  base_model: string | null;
  license: string | null;
  openness: string | null;
  tags: string[];
  downloads: number | null;
  last_updated: string;
};

type SortField = "name" | "downloads" | "last_updated";

const PAGE_SIZE = 20;

function compact(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR");
}

function formatBase(value: string | null): string {
  if (!value) return "";
  const cleaned = value.trim().replace(/^\[+|\]+$/g, "").replace(/^['"]|['"]$/g, "");
  return cleaned.length > 32 ? `${cleaned.slice(0, 30)}…` : cleaned;
}

function rowTags(tags: string[]): string[] {
  return tags.filter(tag => tag !== "TR").slice(0, 2);
}

function matchesQuery(model: TurkishModel, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [model.name, model.organization, model.license ?? "", model.base_model ?? ""]
    .some(field => field.toLowerCase().includes(q));
}

function isOpenWeight(model: TurkishModel): boolean {
  return model.tags.includes("Open Weight")
    || model.openness === "open_weight"
    || model.openness === "open_source";
}

type Props = {
  api: string;
  bootstrap?: TurkishModel[] | null;
};

function normalizeTurkishItems(items: TurkishModel[]): TurkishModel[] {
  return items.map(item => ({
    ...item,
    tags: item.tags?.length ? item.tags : ["TR"],
  }));
}

export default function TurkishLLMPage({ api, bootstrap = null }: Props) {
  const bootReady = bootstrap !== null && bootstrap.length > 0;
  const [items, setItems] = useState<TurkishModel[]>(() => (bootstrap ? normalizeTurkishItems(bootstrap) : []));
  const [loading, setLoading] = useState(!bootReady);
  const skipInitialFetchRef = useRef(bootReady);
  const [query, setQuery] = useState("");
  const [openWeightOnly, setOpenWeightOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("downloads");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!bootstrap?.length) return;
    setItems(normalizeTurkishItems(bootstrap));
    setLoading(false);
    skipInitialFetchRef.current = true;
  }, [bootstrap]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    const controller = new AbortController();
    setLoading(items.length === 0);
    fetch(`${api}/api/v1/models/turkish?limit=200`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (data?.items) {
          setItems(normalizeTurkishItems(data.items as TurkishModel[]));
          setPage(1);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [api]);

  const stats = useMemo(() => ({
    total: items.length,
    openWeight: items.filter(isOpenWeight).length,
  }), [items]);

  const filtered = useMemo(() => {
    let rows = items.filter(item => matchesQuery(item, query));
    if (openWeightOnly) rows = rows.filter(isOpenWeight);

    rows.sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name, "tr");
      if (sortField === "last_updated") {
        return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
      }
      return (b.downloads ?? 0) - (a.downloads ?? 0);
    });
    return rows;
  }, [items, query, openWeightOnly, sortField]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersOn = openWeightOnly || query.trim().length > 0;

  return (
    <section className="tr-page" id="turkish">
      <header className="tr-hero">
        <div>
          <h2>Türkçe odaklı modeller</h2>
          <p className="tr-lead">Yerel geliştiriciler ve açık ağırlıklı modeller.</p>
        </div>
        <div className="tr-stats">
          <div>
            <strong>{loading ? "—" : stats.total}</strong>
            <span>model</span>
          </div>
          <div>
            <strong>{loading ? "—" : stats.openWeight}</strong>
            <span>open-weight</span>
          </div>
        </div>
      </header>

      <div className="tr-toolbar">
        <label className="tr-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1); }}
            placeholder="Model veya kuruluş ara"
          />
        </label>
        <select
          className="tr-select"
          value={sortField}
          onChange={event => { setSortField(event.target.value as SortField); setPage(1); }}
          aria-label="Sırala"
        >
          <option value="downloads">En çok indirilen</option>
          <option value="last_updated">En güncel</option>
          <option value="name">Ada göre</option>
        </select>
        <button
          type="button"
          className={`tr-chip${openWeightOnly ? " on" : ""}`}
          onClick={() => { setOpenWeightOnly(value => !value); setPage(1); }}
        >
          Open-weight
        </button>
        {filtersOn && (
          <button
            type="button"
            className="tr-reset"
            onClick={() => { setQuery(""); setOpenWeightOnly(false); setPage(1); }}
          >
            Temizle
          </button>
        )}
      </div>

      <div className="tr-table-wrap">
        {loading ? (
          <p className="tr-msg">Modeller yükleniyor…</p>
        ) : visible.length ? (
          <div className="tr-scroll">
            <table className="tr-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Kuruluş</th>
                  <th>Lisans</th>
                  <th>İndirme</th>
                  <th>Güncelleme</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(model => {
                  const tags = rowTags(model.tags);
                  const base = formatBase(model.base_model);
                  return (
                    <tr key={model.id}>
                      <td>
                        <strong title={model.name}>{model.name}</strong>
                        {(base || tags.length > 0) && (
                          <div className="tr-row-sub">
                            {base && <span className="tr-base">{base}</span>}
                            {tags.map(tag => (
                              <i key={tag}>{tag}</i>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>{model.organization}</td>
                      <td className="tr-muted">{model.license ?? "—"}</td>
                      <td className="mono tr-num">{compact(model.downloads)}</td>
                      <td className="tr-muted">{formatDate(model.last_updated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tr-msg">
            {items.length ? "Filtrelere uyan model yok." : "Henüz model bulunamadı."}
          </p>
        )}
      </div>

      {pages > 1 && (
        <footer className="tr-pager">
          <button type="button" disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>
            Önceki
          </button>
          <span>{safePage} / {pages}</span>
          <button type="button" disabled={safePage === pages} onClick={() => setPage(p => p + 1)}>
            Sonraki
          </button>
        </footer>
      )}
    </section>
  );
}
