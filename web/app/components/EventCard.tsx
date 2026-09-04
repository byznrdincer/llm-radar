"use client";

import ModelAvatar from "./ModelAvatar";
import {
  categoryClass,
  categoryLabel,
  cleanTitle,
  eventSummary,
  modelLevelLabel,
  organization,
  relativeTime,
  scoreLabel,
  sourceLabel,
  sourceUrl,
} from "../lib/eventPresentation";
import type { FeedEvent } from "../lib/eventTypes";
import { useLanguage } from "../lib/i18n";

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V20l-6-3.5L6 20V4.5Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type EventCardProps = {
  event: FeedEvent;
  saved: boolean;
  onToggleSave: () => void;
};

export default function EventCard({ event, saved, onToggleSave }: EventCardProps) {
  const { language, locale } = useLanguage();
  const org = organization(event);
  const url = sourceUrl(event);
  const summary = eventSummary(event, language, locale);
  const levelLabel = modelLevelLabel(event.model_level, language);

  return (
    <article className="ev-card">
      <div className="ev-card-top">
        <ModelAvatar
          name={org.name}
          companySlug={org.logoSlug}
          companyName={org.name}
          websiteUrl={org.websiteUrl}
          fallbackSlugs={org.fallbackSlugs}
          size="md"
        />
        <div className="ev-badges">
          <span className={`ev-cat ev-${categoryClass(event)}`}>{categoryLabel(event)}</span>
          {levelLabel && <span className={`ev-model-level ${event.model_level}`}>{levelLabel}</span>}
          <span className={`ev-score ${event.importance}`}>
            {scoreLabel(event.importance, event.importance_score)}
          </span>
        </div>
      </div>
      <h4>{cleanTitle(event, language)}</h4>
      {summary && <p>{summary}</p>}
      <footer>
        <span className="ev-card-meta">
          <strong>{sourceLabel(event)}</strong>
          <span aria-hidden="true">•</span>
          <time>{relativeTime(event.detected_at, language, locale)}</time>
        </span>
        <div className="ev-card-actions">
          {url && (
            <a href={url} target="_blank" rel="noreferrer" aria-label={language === "tr" ? "Kaynağı aç" : "Open source"}>↗</a>
          )}
          <button
            type="button"
            className={saved ? "on" : ""}
            aria-label={
              saved
                ? (language === "tr" ? "Kaydı kaldır" : "Remove from saved")
                : (language === "tr" ? "Kaydet" : "Save")
            }
            aria-pressed={saved}
            onClick={onToggleSave}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
      </footer>
    </article>
  );
}
