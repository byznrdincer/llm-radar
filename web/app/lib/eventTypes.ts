export type FeedEvent = {
  id: string;
  event_type: string;
  category: string;
  entity_id: string;
  title: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  change_percentage: string | null;
  importance: string;
  importance_score: number;
  model_openness?: string | null;
  model_level?: string | null;
  detected_at: string;
  evidence?: {
    source?: string;
    source_url?: string;
    sources?: { source?: string; source_url?: string }[];
  } | null;
};

export type EventSort = "priority" | "recent" | "importance";

export type EventOrg = {
  slug: string;
  name: string;
  logoSlug: string;
  fallbackSlugs: string[];
  websiteUrl: string | null;
};
