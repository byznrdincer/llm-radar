from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import (
    BenchmarkDefinition,
    LeaderboardSnapshot,
    Model,
    ModelProfile,
)

BENCHMARK_FOCUSES: dict[str, tuple[str, ...]] = {
    "general": ("general", "intelligence", "overall"),
    "coding": ("coding", "code", "software"),
    "reasoning": ("reasoning", "knowledge", "math"),
    "agent": ("agent", "tool", "computer_use"),
    "multimodal": ("multimodal", "vision", "image"),
}

ADVANCEDNESS_TIERS: dict[str, tuple[float, float]] = {
    "entry": (0.0, 39.9),
    "mid": (40.0, 69.9),
    "advanced": (70.0, 84.9),
    "frontier": (85.0, 100.0),
}


@dataclass(frozen=True, slots=True)
class BenchmarkMatch:
    score: float
    best_rank: int
    benchmarks: tuple[str, ...]
    evidence_count: int
    basis: str = "benchmark"


_match_cache: dict[str, tuple[float, dict[str, BenchmarkMatch]]] = {}
# Leaderboard data refreshes on a ~12h collector cadence, so a few minutes of
# staleness here is invisible while sparing every caller the recompute.
_MATCH_CACHE_TTL_SECONDS = 600.0


def benchmark_matches(session: Session, focus: str) -> dict[str, BenchmarkMatch]:
    terms = BENCHMARK_FOCUSES.get(focus)
    if not terms:
        return {}

    # Resolve which benchmark definitions the focus refers to (a few dozen rows).
    definitions = session.execute(select(BenchmarkDefinition)).scalars().all()
    relevant_defs = {
        definition.id: definition
        for definition in definitions
        if any(
            term in f"{definition.category} {definition.slug} {definition.name}".lower()
            for term in terms
        )
    }
    if not relevant_defs:
        return {}

    # Only the most recent publication of each (benchmark, category) contributes:
    # older snapshots are always deduped away by the (model, benchmark) guard below,
    # so loading full leaderboard history here is wasted work.
    latest = session.execute(
        select(
            LeaderboardSnapshot.benchmark_id,
            LeaderboardSnapshot.category,
            func.max(LeaderboardSnapshot.published_at),
        )
        .where(LeaderboardSnapshot.benchmark_id.in_(relevant_defs))
        .group_by(LeaderboardSnapshot.benchmark_id, LeaderboardSnapshot.category)
    ).all()
    if not latest:
        return {}

    snapshots = (
        session.execute(
            select(LeaderboardSnapshot)
            .where(
                tuple_(
                    LeaderboardSnapshot.benchmark_id,
                    LeaderboardSnapshot.category,
                    LeaderboardSnapshot.published_at,
                ).in_([(bid, category, published) for bid, category, published in latest])
            )
            .order_by(LeaderboardSnapshot.published_at.desc(), LeaderboardSnapshot.rank.asc())
        )
        .scalars()
        .all()
    )
    relevant = [(snapshot, relevant_defs[snapshot.benchmark_id]) for snapshot in snapshots]

    field_sizes: dict[tuple[Any, Any, str], int] = defaultdict(int)
    for snapshot, benchmark in relevant:
        key = (benchmark.id, snapshot.published_at, snapshot.category)
        field_sizes[key] = max(field_sizes[key], snapshot.rank)

    seen: set[tuple[str, Any]] = set()
    scores: dict[str, list[float]] = defaultdict(list)
    ranks: dict[str, list[int]] = defaultdict(list)
    names: dict[str, set[str]] = defaultdict(set)
    for snapshot, benchmark in relevant:
        model_key = canonical_model_name(snapshot.model_external_id)
        evidence_key = (model_key, benchmark.id)
        if not model_key or evidence_key in seen:
            continue
        seen.add(evidence_key)
        size = field_sizes[(benchmark.id, snapshot.published_at, snapshot.category)]
        percentile = 100.0 if size <= 1 else 100.0 * (size - snapshot.rank) / (size - 1)
        scores[model_key].append(max(0.0, min(100.0, percentile)))
        ranks[model_key].append(snapshot.rank)
        names[model_key].add(benchmark.name)
    return {
        key: BenchmarkMatch(
            score=round(sum(values) / len(values), 1),
            best_rank=min(ranks[key]),
            benchmarks=tuple(sorted(names[key])),
            evidence_count=len(values),
        )
        for key, values in scores.items()
    }


def multimodal_profile_matches(session: Session) -> dict[str, BenchmarkMatch]:
    """Rank multimodal models from asserted profile modalities when no benchmark exists.

    This is deliberately evidence based: a model is included only when its normalized
    profile explicitly asserts text plus at least one non-text modality. The score is
    the percentage of the four catalog modalities that are present.
    """
    supported = {"text", "image", "audio", "video"}
    strongest: dict[str, tuple[float, tuple[str, ...]]] = {}
    rows = session.execute(
        select(Model, ModelProfile).join(ModelProfile, ModelProfile.model_id == Model.id)
    ).all()
    for model, profile in rows:
        modalities = tuple(sorted(set(profile.modalities or []) & supported))
        if "text" not in modalities or len(modalities) < 2:
            continue
        key = canonical_model_name(model.name)
        if not key:
            continue
        score = round(100.0 * len(modalities) / len(supported), 1)
        current = strongest.get(key)
        if current is None or score > current[0]:
            strongest[key] = (score, modalities)

    ordered = sorted(strongest.items(), key=lambda item: (-item[1][0], item[0]))
    return {
        key: BenchmarkMatch(
            score=score,
            best_rank=rank,
            benchmarks=(f"Profil modaliteleri: {', '.join(modalities)}",),
            evidence_count=len(modalities),
            basis="profile",
        )
        for rank, (key, (score, modalities)) in enumerate(ordered, start=1)
    }


def selection_matches(session: Session, focus: str) -> dict[str, BenchmarkMatch]:
    """Return the strongest available evidence for a model-selection focus."""
    now = time.time()
    cached = _match_cache.get(focus)
    if cached and now - cached[0] < _MATCH_CACHE_TTL_SECONDS:
        return cached[1]

    matches = benchmark_matches(session, focus)
    if matches or focus != "multimodal":
        result = matches
    else:
        result = multimodal_profile_matches(session)
    _match_cache[focus] = (now, result)
    return result


def advancedness_tier_for_score(score: float | None) -> str | None:
    if score is None:
        return None
    for tier, (lower, upper) in ADVANCEDNESS_TIERS.items():
        if lower <= score <= upper:
            return tier
    return None


def matches_advancedness_filter(score: float | None, selected_tiers: set[str]) -> bool:
    if not selected_tiers:
        return True
    if score is None:
        return "unscored" in selected_tiers
    tier = advancedness_tier_for_score(score)
    return tier in selected_tiers if tier is not None else False
