import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { trackEvent } from "./analytics";
import type { ComparedModel } from "./catalogTypes";
import type { CompareModelInput } from "./modelComparison";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** Up to 3 models picked for comparison, plus the compare-profile fetch that
 * fills in once a 2nd model makes the comparison meaningful. `setError`
 * mirrors the original inline effect's `setError(true)` - a failed compare
 * fetch surfaces through the same page-level API-connectivity banner. A
 * `useState` setter is referentially stable, so passing it through the
 * dependency array below doesn't change how often this effect re-runs. */
export function useModelCompare(setError: Dispatch<SetStateAction<boolean>>) {
    const [selected, setSelected] = useState<CompareModelInput[]>([]);
    const [compareProfiles, setCompareProfiles] = useState<Record<string, ComparedModel>>({});

    useEffect(() => {
        if (selected.length < 2) {
            return;
        }
        const params = new URLSearchParams();
        selected.forEach(model => params.append("ids", model.id));
        fetch(`${API}/api/v1/models/compare?${params}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data)
                    setCompareProfiles(Object.fromEntries((data.items as ComparedModel[]).map(item => [item.id, item])));
            })
            .catch(() => setError(true));
    }, [selected, setError]);

    function toggle(model: CompareModelInput) {
        setSelected(current => {
            const removing = current.some(item => item.id === model.id);
            if (!removing && current.length < 3)
                trackEvent(API, "model_compared", { model_id: model.id, related_model_ids: [...current.map(item => item.id), model.id] });
            return removing ? current.filter(item => item.id !== model.id) : current.length < 3 ? [...current, model] : current;
        });
    }

    return { selected, compareProfiles, toggle };
}
