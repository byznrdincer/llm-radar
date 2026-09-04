import type { FeedEvent } from "./eventTypes";

const STORAGE_KEY = "llm-radar-saved-events";

export type SavedEventRecord = {
  id: string;
  savedAt: string;
  event: FeedEvent;
};

export function loadSavedEvents(): Record<string, SavedEventRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SavedEventRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSavedEvents(saved: Record<string, SavedEventRecord>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function toggleSavedEvent(
  event: FeedEvent,
  current: Record<string, SavedEventRecord>,
): Record<string, SavedEventRecord> {
  const next = { ...current };
  if (next[event.id]) delete next[event.id];
  else next[event.id] = { id: event.id, savedAt: new Date().toISOString(), event };
  writeSavedEvents(next);
  return next;
}

export function savedEventList(saved: Record<string, SavedEventRecord>): SavedEventRecord[] {
  return Object.values(saved).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}
