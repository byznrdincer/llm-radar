"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useLanguage } from "../lib/i18n";
import type { ModelOption, ModelPickerProps, SearchState } from "../lib/feedbackTypes";

export default function ModelPicker({
  api,
  selected,
  onChange,
  multiple = true,
  placeholder,
  maxSelected = 20,
}: ModelPickerProps) {
  const { language } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId().replace(/:/g, "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModelOption[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const resolvedPlaceholder =
    placeholder ??
    (language === "tr"
      ? "Model veya geliştirici ara..."
      : "Search model or developer...");

  useEffect(() => {
    const q = query.trim();

    if (!q) {
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      setOpen(true);

      const params = new URLSearchParams({
        search: q,
        limit: "12",
        sort_by: "name",
        sort_order: "asc",
      });

      try {
        const response = await fetch(
          `${api}/api/v1/models/search?${params}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Model search failed");
        }

        const data = await response.json();

        const items = (data?.items ?? []) as {
          id: string;
          name: string;
          slug: string;
          developer: {
            slug: string;
            name: string;
          };
        }[];

        setResults(
          items.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            developer: item.developer,
          })),
        );

        setHighlight(0);
        setSearchState("success");
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearchState("error");
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, query]);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", close);

    return () => {
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const availableResults = results.filter(
    (model) => !selected.some((item) => item.id === model.id),
  );

  function choose(model: ModelOption) {
    if (multiple) {
      if (selected.length >= maxSelected) return;
      onChange([...selected, model]);
    } else {
      onChange([model]);
    }

    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function remove(modelId: string) {
    onChange(selected.filter((model) => model.id !== modelId));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!open || availableResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        Math.min(current + 1, availableResults.length - 1),
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    }

    if (event.key === "Enter") {
      const model = availableResults[highlight];

      if (model) {
        event.preventDefault();
        choose(model);
      }
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="smart-model-picker">
      {selected.length > 0 && (
        <div className="smart-model-selected">
          {selected.map((model) => (
            <button
              type="button"
              className="smart-model-chip"
              key={model.id}
              onClick={() => remove(model.id)}
              title={
                language === "tr"
                  ? `${model.name} seçimini kaldır`
                  : `Remove ${model.name}`
              }
            >
              <span>{model.name}</span>
              <b aria-hidden="true">×</b>
            </button>
          ))}
        </div>
      )}

      <div className="smart-model-search" ref={rootRef}>
        <div className="smart-model-input">
          <span aria-hidden="true">⌕</span>

          <input
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (!nextQuery.trim()) {
                setResults([]);
                setSearchState("idle");
                setOpen(false);
                return;
              }
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim()) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={resolvedPlaceholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${listId}-results`}
          />

          {searchState === "loading" && (
            <small>{language === "tr" ? "Aranıyor…" : "Searching…"}</small>
          )}
        </div>

        {open && (
          <div
            className="smart-model-menu"
            id={`${listId}-results`}
            role="listbox"
          >
            {searchState === "error" && (
              <p className="smart-model-message">
                {language === "tr"
                  ? "Modeller yüklenemedi. Tekrar deneyebilirsin."
                  : "Couldn't load models. Please try again."}
              </p>
            )}

            {searchState !== "loading" &&
              searchState !== "error" &&
              availableResults.length === 0 && (
                <p className="smart-model-message">
                  {language === "tr"
                    ? "Sonuç bulunamadı."
                    : "No results found."}
                </p>
              )}

            {availableResults.map((model, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? "active" : ""}
                key={model.id}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(model)}
              >
                <span className="smart-model-mark" aria-hidden="true">
                  {model.name.slice(0, 2).toUpperCase()}
                </span>

                <span className="smart-model-copy">
                  <strong>{model.name}</strong>
                  <small>{model.developer.name}</small>
                </span>

                <b className="smart-model-add" aria-hidden="true">
                  +
                </b>
              </button>
            ))}
          </div>
        )}
      </div>

      {multiple && selected.length > 0 && (
        <p className="smart-model-note">
          {language === "tr"
            ? `${selected.length} model seçildi · En fazla ${maxSelected}`
            : `${selected.length} model${selected.length === 1 ? "" : "s"} selected · Max ${maxSelected}`}
        </p>
      )}
    </div>
  );
}
