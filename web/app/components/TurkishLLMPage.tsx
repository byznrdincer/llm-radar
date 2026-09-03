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
  source_url?: string | null;
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

type TurkishRadarItem = {
  rank: number;
  model_name: string;
  organization: string;
  score: number;
  coverage: number;
  benchmark_count: number;
  category_count: number;
};

type TurkishRadarData = {
  eligible_count: number;
  items: TurkishRadarItem[];
};

type TurkishRadarRawItem = Omit<TurkishRadarItem, "rank" | "score"> & {
  rank: number | null;
  score: number | null;
};

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
  const [radar, setRadar] = useState<TurkishRadarData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/api/v1/insights/radar-score?origin=turkish&limit=10`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!data) return;
        // The endpoint also lists catalog models with no score yet (used by
        // the Genel Bakış full-catalog view) - this leaderboard only wants
        // the ranked, actually-scored ones.
        const scored = ((data.items ?? []) as TurkishRadarRawItem[])
          .filter((item): item is TurkishRadarItem => item.score != null && item.rank != null);
        setRadar({ eligible_count: data.eligible_count, items: scored });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api]);

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
    <section className="turkish-page" id="turkish">
      <header className="turkish-hero">
        <div>
          <h2>Türkçe odaklı modeller</h2>
          <p className="turkish-lead">Yerel geliştiriciler ve açık ağırlıklı modeller.</p>
        </div>
        <div className="turkish-stats">
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

      <section className="turkish-radar" aria-label="Turkiye LLM Score">
        <header className="turkish-radar-head">
          <div>
            <h3>Turkiye LLM Score</h3>
            <p>Mevcut Radar Score motoruyla (ayni normalizasyon, kategori agirliklari ve kapsam kurallariyla) Turkiye sinyali tasiyan modeller icin hesaplanir. Bu ayri bir Turkce degerlendirme suit'i degildir - ucuncu taraf benchmark sonuclarinin bu alt kumeye uygulanmis halidir.</p>
          </div>
        </header>
        {radar?.items.length ? (
          <ol className="turkish-radar-list">
            {radar.items.map(item => (
              <li key={`${item.organization}:${item.model_name}`}>
                <b>#{item.rank}</b>
                <span>
                  <strong>{item.model_name}</strong>
                  <small>{item.organization} · {item.benchmark_count} benchmark / {item.category_count} kategori</small>
                </span>
                <em>{item.score.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}<small>%{item.coverage} kapsam</small></em>
              </li>
            ))}
          </ol>
        ) : (
          <div className="turkish-radar-empty">
            <p>Su an takip edilen uluslararasi benchmark&apos;larda (Arena, AA Intelligence Index) yeterli veri kapsamina ulasan bir Turkiye modeli yok.</p>
            <small>Skor uydurmuyoruz - kapsam olustukca burada gorunecek.</small>
          </div>
        )}
      </section>

      <div className="turkish-toolbar">
        <label className="turkish-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1); }}
            placeholder="Model veya kuruluş ara"
          />
        </label>
        <select
          className="turkish-select"
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
          className={`turkish-chip${openWeightOnly ? " on" : ""}`}
          onClick={() => { setOpenWeightOnly(value => !value); setPage(1); }}
        >
          Open-weight
        </button>
        {filtersOn && (
          <button
            type="button"
            className="turkish-reset"
            onClick={() => { setQuery(""); setOpenWeightOnly(false); setPage(1); }}
          >
            Temizle
          </button>
        )}
      </div>

      <div className="turkish-table-wrap">
        {loading ? (
          <p className="turkish-msg">Modeller yükleniyor…</p>
        ) : visible.length ? (
          <div className="turkish-scroll">
            <table className="turkish-table">
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
                        <span className="turkish-name-row">
                          <strong title={model.name}>{model.name}</strong>
                          {model.source_url && (
                            <a
                              className="turkish-source-link"
                              href={model.source_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`${model.name} icin kaynagi ac`}
                            >
                              {"\u2197"}
                            </a>
                          )}
                        </span>
                        {(base || tags.length > 0) && (
                          <div className="turkish-row-sub">
                            {base && <span className="turkish-base">{base}</span>}
                            {tags.map(tag => (
                              <i key={tag}>{tag}</i>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>{model.organization}</td>
                      <td className="turkish-muted">{model.license ?? "—"}</td>
                      <td className="mono turkish-num">{compact(model.downloads)}</td>
                      <td className="turkish-muted">{formatDate(model.last_updated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="turkish-msg">
            {items.length ? "Filtrelere uyan model yok." : "Henüz model bulunamadı."}
          </p>
        )}
      </div>

      {pages > 1 && (
        <footer className="turkish-pager">
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
