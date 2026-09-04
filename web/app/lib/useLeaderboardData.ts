import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { LIVEBENCH_VIEW_CATEGORY, type Leaderboard, type LeaderboardView } from "../components/LeaderboardPage";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const LEADERBOARD_LIMIT = 40;

type BoardKey = "general" | "coding" | "swe-live" | "tau-bench" | "intelligence" | "aa-coding" | "agentic" | "livebench" | "mmlu-pro" | "livecodebench";

function boardKeyForView(view: LeaderboardView): BoardKey {
    if (view === "general") return "general";
    if (view === "coding") return "coding";
    if (view === "swe-live") return "swe-live";
    if (view === "tau-bench") return "tau-bench";
    if (view === "intelligence") return "intelligence";
    if (view === "aa-coding") return "aa-coding";
    if (view === "agentic") return "agentic";
    if (view === "mmlu-pro") return "mmlu-pro";
    if (view === "livecodebench") return "livecodebench";
    return "livebench";
}

function leaderboardUrl(
    boardKey: BoardKey,
    livebenchCategory: string,
    mmluCategory: string,
    sweLiveCategory: string,
    tauCategory: string,
): string {
    switch (boardKey) {
        case "general":
            return `${API}/api/v1/leaderboards/arena?limit=${LEADERBOARD_LIMIT}`;
        case "coding":
            return `${API}/api/v1/leaderboards/swe-bench?limit=${LEADERBOARD_LIMIT}`;
        case "swe-live":
            return `${API}/api/v1/leaderboards/swe-bench-live?category=${sweLiveCategory}&limit=${LEADERBOARD_LIMIT}`;
        case "tau-bench":
            return `${API}/api/v1/leaderboards/tau-bench?category=${tauCategory}&limit=${LEADERBOARD_LIMIT}`;
        case "intelligence":
            return `${API}/api/v1/leaderboards/artificial-analysis/intelligence?limit=${LEADERBOARD_LIMIT}`;
        case "aa-coding":
            return `${API}/api/v1/leaderboards/artificial-analysis/coding?limit=${LEADERBOARD_LIMIT}`;
        case "agentic":
            return `${API}/api/v1/leaderboards/artificial-analysis/agentic?limit=${LEADERBOARD_LIMIT}`;
        case "mmlu-pro":
            return `${API}/api/v1/leaderboards/mmlu-pro?category=${mmluCategory}&limit=${LEADERBOARD_LIMIT}`;
        case "livecodebench":
            return `${API}/api/v1/leaderboards/livecodebench?limit=${LEADERBOARD_LIMIT}`;
        default:
            return `${API}/api/v1/leaderboards/livebench?category=${livebenchCategory}&limit=${LEADERBOARD_LIMIT}`;
    }
}

function cachedLeaderboard(
    boardKey: BoardKey,
    boards: {
        arena: Leaderboard | null;
        swebench: Leaderboard | null;
        swebenchLive: Leaderboard | null;
        tauBench: Leaderboard | null;
        aaIntelligence: Leaderboard | null;
        aaCoding: Leaderboard | null;
        aaAgentic: Leaderboard | null;
        livebench: Leaderboard | null;
        mmluPro: Leaderboard | null;
        livecodebench: Leaderboard | null;
    },
    categories: {
        livebenchCategory: string;
        mmluCategory: string;
        sweLiveCategory: string;
        tauCategory: string;
    },
): Leaderboard | null {
    let board: Leaderboard | null = null;
    if (boardKey === "general") board = boards.arena;
    else if (boardKey === "coding") board = boards.swebench;
    else if (boardKey === "swe-live") board = boards.swebenchLive;
    else if (boardKey === "tau-bench") board = boards.tauBench;
    else if (boardKey === "intelligence") board = boards.aaIntelligence;
    else if (boardKey === "aa-coding") board = boards.aaCoding;
    else if (boardKey === "agentic") board = boards.aaAgentic;
    else if (boardKey === "mmlu-pro") board = boards.mmluPro;
    else if (boardKey === "livecodebench") board = boards.livecodebench;
    else board = boards.livebench;

    if (!board?.items?.length) return null;
    if (boardKey === "livebench" && board.category !== categories.livebenchCategory) return null;
    if (boardKey === "mmlu-pro" && board.category !== categories.mmluCategory) return null;
    if (boardKey === "swe-live" && board.category !== categories.sweLiveCategory) return null;
    if (boardKey === "tau-bench" && board.category !== categories.tauCategory) return null;
    return board;
}

function applyLeaderboardData(
    boardKey: BoardKey,
    data: Leaderboard,
    setters: {
        setArena: Dispatch<SetStateAction<Leaderboard | null>>;
        setSwebench: Dispatch<SetStateAction<Leaderboard | null>>;
        setSwebenchLive: Dispatch<SetStateAction<Leaderboard | null>>;
        setTauBench: Dispatch<SetStateAction<Leaderboard | null>>;
        setAaIntelligence: Dispatch<SetStateAction<Leaderboard | null>>;
        setAaCoding: Dispatch<SetStateAction<Leaderboard | null>>;
        setAaAgentic: Dispatch<SetStateAction<Leaderboard | null>>;
        setLivebench: Dispatch<SetStateAction<Leaderboard | null>>;
        setMmluPro: Dispatch<SetStateAction<Leaderboard | null>>;
        setLivecodebench: Dispatch<SetStateAction<Leaderboard | null>>;
    },
) {
    if (boardKey === "general") setters.setArena(data);
    else if (boardKey === "coding") setters.setSwebench(data);
    else if (boardKey === "swe-live") setters.setSwebenchLive(data);
    else if (boardKey === "tau-bench") setters.setTauBench(data);
    else if (boardKey === "intelligence") setters.setAaIntelligence(data);
    else if (boardKey === "aa-coding") setters.setAaCoding(data);
    else if (boardKey === "agentic") setters.setAaAgentic(data);
    else if (boardKey === "mmlu-pro") setters.setMmluPro(data);
    else if (boardKey === "livecodebench") setters.setLivecodebench(data);
    else setters.setLivebench(data);
}

/**
 * All 10 leaderboards (Arena, SWE-bench x2, tau-bench, 3x Artificial
 * Analysis, LiveBench, MMLU-Pro, LiveCodeBench), the currently selected
 * view, and the per-board category pickers (LiveBench/MMLU-Pro/SWE-bench
 * Live/tau-bench each have their own sub-category). Arena, AA Intelligence
 * and SWE-bench are warmed on mount since they're the boards most views
 * land on first; every other board is fetched lazily the first time its
 * view is selected and then cached in state.
 */
export function useLeaderboardData() {
    const [arena, setArena] = useState<Leaderboard | null>(null);
    const [swebench, setSwebench] = useState<Leaderboard | null>(null);
    const [swebenchLive, setSwebenchLive] = useState<Leaderboard | null>(null);
    const [tauBench, setTauBench] = useState<Leaderboard | null>(null);
    const [aaIntelligence, setAaIntelligence] = useState<Leaderboard | null>(null);
    const [aaCoding, setAaCoding] = useState<Leaderboard | null>(null);
    const [aaAgentic, setAaAgentic] = useState<Leaderboard | null>(null);
    const [livebench, setLivebench] = useState<Leaderboard | null>(null);
    const [mmluPro, setMmluPro] = useState<Leaderboard | null>(null);
    const [livecodebench, setLivecodebench] = useState<Leaderboard | null>(null);
    const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>("general");
    const [livebenchCategory, setLivebenchCategory] = useState("overall");
    const [mmluCategory, setMmluCategory] = useState("overall");
    const [sweLiveCategory, setSweLiveCategory] = useState("lite");
    const [tauCategory, setTauCategory] = useState("airline");

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        fetch(`${API}/api/v1/leaderboards/arena?limit=${LEADERBOARD_LIMIT}`, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setArena(data as Leaderboard); })
            .catch(() => { /* optional */ });

        fetch(`${API}/api/v1/leaderboards/artificial-analysis/intelligence?limit=${LEADERBOARD_LIMIT}`, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setAaIntelligence(data as Leaderboard); })
            .catch(() => { /* optional */ });

        fetch(`${API}/api/v1/leaderboards/swe-bench?limit=${LEADERBOARD_LIMIT}`, { signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setSwebench(data as Leaderboard); })
            .catch(() => { /* optional */ });

        return () => controller.abort();
    }, []);

    useEffect(() => {
        const boardKey = boardKeyForView(leaderboardView);
        const boards = {
            arena,
            swebench,
            swebenchLive,
            tauBench,
            aaIntelligence,
            aaCoding,
            aaAgentic,
            livebench,
            mmluPro,
            livecodebench,
        };
        const categories = { livebenchCategory, mmluCategory, sweLiveCategory, tauCategory };
        if (cachedLeaderboard(boardKey, boards, categories))
            return;

        const controller = new AbortController();
        fetch(leaderboardUrl(boardKey, livebenchCategory, mmluCategory, sweLiveCategory, tauCategory), { signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                applyLeaderboardData(boardKey, data as Leaderboard, {
                    setArena,
                    setSwebench,
                    setSwebenchLive,
                    setTauBench,
                    setAaIntelligence,
                    setAaCoding,
                    setAaAgentic,
                    setLivebench,
                    setMmluPro,
                    setLivecodebench,
                });
            })
            .catch(() => { /* keep previous board */ });

        return () => controller.abort();
    }, [leaderboardView, livebenchCategory, mmluCategory, sweLiveCategory, tauCategory, arena, swebench, swebenchLive, tauBench, aaIntelligence, aaCoding, aaAgentic, livebench, mmluPro, livecodebench]);

    function selectLeaderboardView(view: LeaderboardView) {
        setLeaderboardView(view);
        const category = LIVEBENCH_VIEW_CATEGORY[view];
        if (category)
            setLivebenchCategory(category);
    }

    const leaderboardBoards = useMemo(() => ({
        general: arena,
        coding: swebench,
        "swe-live": swebenchLive,
        "tau-bench": tauBench,
        intelligence: aaIntelligence,
        "aa-coding": aaCoding,
        agentic: aaAgentic,
        livebench,
        "mmlu-pro": mmluPro,
        livecodebench,
    }), [arena, swebench, swebenchLive, tauBench, aaIntelligence, aaCoding, aaAgentic, livebench, mmluPro, livecodebench]);

    return {
        leaderboardView,
        setLeaderboardView,
        selectLeaderboardView,
        leaderboardBoards,
        livebenchCategory,
        setLivebenchCategory,
        mmluCategory,
        setMmluCategory,
        sweLiveCategory,
        setSweLiveCategory,
        tauCategory,
        setTauCategory,
    };
}
