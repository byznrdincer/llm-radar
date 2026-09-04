import { useState } from "react";
import type { LeaderboardItem } from "../components/LeaderboardPage";
import { useLanguage } from "./i18n";
import { trackEvent } from "./analytics";
import type { ModelDetail, ModelItem, SearchModelItem } from "./catalogTypes";
import { findLocalModel, leaderboardModelCandidates, normalizeModelKey } from "./homeContent";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Opening the model detail drawer: by catalog id directly, or - from a
 * leaderboard row, which only carries a benchmark's own model name/org
 * string - resolved to a catalog model first (local match, then the
 * backend's /models/resolve, then a name search) before opening.
 */
export function useModelDetail(models: ModelItem[]) {
    const { language } = useLanguage();
    const [detail, setDetail] = useState<ModelDetail | null>(null);
    const [detailMissing, setDetailMissing] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    async function openDetailById(modelId: string) {
        setDetailLoading(true);
        setDetail(null);
        setDetailMissing(null);
        try {
            const response = await fetch(`${API}/api/v1/models/${modelId}`);
            if (!response.ok)
                throw new Error(language === "tr" ? "Model ayrıntıları alınamadı" : "Failed to load model details");
            setDetail(await response.json());
            trackEvent(API, "model_viewed", { model_id: modelId });
        }
        catch {
            setDetailMissing(language === "tr" ? "Model ayrıntıları yüklenemedi." : "Failed to load model details.");
        }
        finally {
            setDetailLoading(false);
        }
    }

    async function openDetail(model: { id: string }) {
        await openDetailById(model.id);
    }

    async function inspectLeaderboardModel(item: LeaderboardItem) {
        if (item.catalog_model_id) {
            await openDetailById(item.catalog_model_id);
            return;
        }
        const rawCandidates = leaderboardModelCandidates(item.model_name);

        // Benchmark kaynakları bazı model adlarına yayın durumu ekleyebiliyor:
        // qwen3.7-max-preview -> qwen3.7-max
        // xxx-latest -> xxx
        // xxx-beta -> xxx
        //
        // Önce tam adı deneriz; eşleşmezse temel model adına geri düşeriz.
        const baseBenchmarkName = item.model_name
            .trim()
            .replace(/[-_: ](?:preview|latest|beta|experimental|exp)$/i, "");

        const modelCandidates = Array.from(
            new Set([
                ...rawCandidates,
                ...(baseBenchmarkName !== item.model_name.trim()
                    ? leaderboardModelCandidates(baseBenchmarkName)
                    : []),
                baseBenchmarkName,
            ].filter(Boolean)),
        );
        for (const candidate of modelCandidates) {
            const local = findLocalModel(candidate, item.organization, models);
            if (local) {
                await openDetailById(local.id);
                return;
            }
        }
        setDetailLoading(true);
        setDetail(null);
        setDetailMissing(null);
        try {
            for (const candidate of modelCandidates) {
                const params = new URLSearchParams({ name: candidate });
                if (item.organization)
                    params.set("organization", item.organization);
                const resolved = await fetch(`${API}/api/v1/models/resolve?${params}`);
                if (resolved.ok) {
                    const data = await resolved.json() as { id: string };
                    await openDetailById(data.id);
                    return;
                }
            }
            const primaryName = modelCandidates[0] ?? item.model_name;
            const search = new URLSearchParams({ search: primaryName, limit: "8", sort_by: "name" });
            const response = await fetch(`${API}/api/v1/models/search?${search}`);
            if (!response.ok)
                throw new Error(language === "tr" ? "Arama başarısız" : "Search failed");
            const data = await response.json() as { items?: SearchModelItem[] };
            const items = data.items ?? [];
            const orgKey = item.organization.toLowerCase().trim();
            const key = normalizeModelKey(primaryName);
            const match = items.find(entry => entry.developer.name.toLowerCase() === orgKey || entry.developer.slug === orgKey)
                ?? items.find(entry => normalizeModelKey(entry.slug) === key || normalizeModelKey(entry.name) === key);
            if (match) {
                await openDetailById(match.id);
                return;
            }
            setDetailMissing(language === "tr" ? `${item.model_name} için katalogda eşleşen temel model bulunamadı.` : `No matching model found in the catalog for ${item.model_name}.`);
        }
        catch {
            setDetailMissing(language === "tr" ? `${item.model_name} için katalog bilgisi alınamadı.` : `Failed to load catalog data for ${item.model_name}.`);
        }
        finally {
            setDetailLoading(false);
        }
    }

    function closeDetail() {
        setDetail(null);
        setDetailMissing(null);
    }

    return {
        detail,
        detailMissing,
        detailLoading,
        openDetailById,
        openDetail,
        inspectLeaderboardModel,
        closeDetail,
    };
}
