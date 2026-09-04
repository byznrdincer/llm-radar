import type { ModelDetailData } from "../components/ModelDetailDrawer";

export type Pricing = {
    input: string | null;
    output: string | null;
    cache_read: string | null;
    currency: string;
    observed_at: string;
};
export type SelectionEvidence = {
    benchmark_score: number;
    best_rank: number;
    benchmarks: string[];
    evidence_count: number;
    explanation: string;
};
export type ModelItem = {
    id: string;
    slug: string;
    name: string;
    family?: string | null;
    release_date?: string | null;
    parameter_count?: number | null;
    active_parameter_count?: number | null;
    backend?: string | null;
    company: {
        slug: string;
        name: string;
    };
    context_window: number | null;
    capabilities: {
        input_modalities?: string[];
        output_modalities?: string[];
    };
    pricing: Pricing | null;
    profile?: {
        tool_calling: boolean | null;
        reasoning: boolean | null;
        availability: string | null;
        openness?: string | null;
        license: string | null;
        commercial_use_status?: string | null;
    };
    selection?: SelectionEvidence | null;
};
export type SearchModelItem = {
    id: string;
    slug: string;
    name: string;
    family: string | null;
    release_date: string | null;
    parameter_count: number | null;
    active_parameter_count: number | null;
    developer: {
        slug: string;
        name: string;
    };
    provider: {
        slug: string;
        name: string;
    } | null;
    providers: string[];
    context_window: number | null;
    pricing: {
        input: string | null;
        output: string | null;
        cache_read: string | null;
    };
    modalities: string[];
    tool_calling: boolean | null;
    reasoning: boolean | null;
    availability: string | null;
    openness: string;
    license: string | null;
    license_category: string;
    commercial_use_status: string;
    observed_at: string;
    selection: SelectionEvidence | null;
};
export type ComparedModel = {
    id: string;
    selection?: {
        benchmark_score: number;
        best_rank: number;
        benchmarks?: string[];
        evidence_count?: number;
    } | null;
    features: {
        context_window: number | null;
        input_price: string | null;
        output_price: string | null;
        cache_read_price: string | null;
        modalities: string[];
        tool_calling: boolean | null;
        reasoning: boolean | null;
        availability: string | null;
        license: string | null;
    };
};
export type ModelDetail = ModelDetailData;
export type Stats = {
    companies: number;
    models: number;
    snapshots: number;
    price_observations: number;
    change_events: number;
};
export type TechnologyItem = {
    slug: string;
    name: string;
    category: string;
    strength: string;
    last_seen_at: string;
    evidence: Record<string, unknown>;
};
export type Facets = {
    developers: {
        slug: string;
        name: string;
        count: number;
        website_url?: string | null;
    }[];
    providers: {
        slug: string;
        name: string;
        count: number;
    }[];
    families: {
        name: string;
        count: number;
    }[];
    modalities: {
        name: string;
        count: number;
    }[];
    capabilities: {
        name: string;
        count: number;
    }[];
    licenses: {
        name: string;
        count: number;
    }[];
    openness: {
        name: string;
        count: number;
    }[];
    commercial_use: {
        name: string;
        count: number;
    }[];
    benchmark_focuses: string[];
};
export type SortBy =
    | "name"
    | "provider"
    | "context"
    | "input_price"
    | "output_price"
    | "release_date"
    | "benchmark_score"
    | "parameter_count"
    | "active_parameter_count"
    | "backend"
    | "updated_at"
    | "best_match";

export const emptyStats: Stats = {
    companies: 0,
    models: 0,
    snapshots: 0,
    price_observations: 0,
    change_events: 0,
};
