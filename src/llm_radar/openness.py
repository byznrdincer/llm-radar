"""Resolve a model's effective license and openness.

Benchmark feeds and provider catalogs disagree about, or simply omit, whether a
model's weights are open. These helpers layer the signals in priority order -
an explicit profile field, then a small curated set of verified models, then
family-level rules whose public/closed status is unambiguous - and never invent
an answer. Kept out of the API module so the read-model refresh and the
processor can share them without importing FastAPI.
"""

from __future__ import annotations

from llm_radar.database.models import Company, Model, ModelProfile

_UNKNOWN_LICENSES = {"", "unknown", "n/a", "none", "null", "-"}

# Benchmark providers sometimes publish a score before their machine-readable feed
# includes the open_weights field.  Keep the small set of manually verified models
# here so a feed omission does not become a misleading question mark in the UI.
# Values describe weight availability, not whether the full training stack meets
# the OSI Open Source AI definition.
_VERIFIED_MODEL_LICENSES = {
    "a.x-k2": "Apache-2.0",
    "agnes 2.5 pro alpha": "Open",
    "agnes 2.5 pro beta": "Proprietary",
    "apodex 1.1": "Open",
    "athene-v2-chat": "Open",
    "echo-ego-v2-14b": "Open",
    "ernie-4.5-300b-a47b": "Apache-2.0",
    "g9v3-39a5b": "Apache-2.0",
    "hy3": "Apache-2.0",
    "inkling": "Apache-2.0",
    "inkling small": "Apache-2.0",
    "intern-s1": "Apache-2.0",
    "jt-4.1 flash 236b a21b": "Proprietary",
    "k2.5-1t-a32b": "Open",
    "kat coder pro v2": "Proprietary",
    "ling 3.0 flash": "MIT",
    "longcat-flash-chat": "MIT",
    "minimax-m1": "Open",
    "minimax-text-01": "Open",
    "mimo-v2-flash": "MIT",
    "mimo-v2-pro": "MIT",
    "mimo-v2.5": "MIT",
    "mimo-v2.5-pro": "MIT",
    "mistral medium 3.5": "Open",
    "motif 3": "MIT",
    "motif 3 (beta)": "MIT",
    "muse glimmer": "Open",
    "muse spark": "Proprietary",
    "nex-n2-pro": "Apache-2.0",
    "pine voice preview": "Proprietary",
    "raft-30b-a3b": "Proprietary",
    "solar open2 250b": "Open",
    "solar pro 4": "Proprietary",
    "xbai-o4-medium": "Apache-2.0",
    "yi-large": "Proprietary",
    "yi-lightning": "Proprietary",
}

_NOT_APPLICABLE_BENCHMARK_ENTRIES = {
    "brokk + sonnet4.5 (standard) + flash3 (minimal)",
    "cascaded baseline",
    "distyl buttonagent (high)",
}

# Model families whose full training pipeline (data + training code, not just
# downloadable weights) is publicly documented and released - distinct from
# open_weight, where only the weights are known to be available. Kept as a
# short, curated list of unambiguous, well-documented cases rather than
# inferred from a license string, since "open_source" is a stronger claim
# than any license alone can verify.
_KNOWN_OPEN_SOURCE_FAMILY_PREFIXES = (
    "olmo",
    "pythia",
    "gpt-neox",
    "gpt-j",
    "bloomz",
    "bloom-",
    "starcoder",
    "smollm",
    "redpajama",
    "amber",
    "crystalcoder",
    "k2-think",
    "k2-chat",
    "dolly-v2",
)


def _normalized_model_label(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", "-").split())


def _meaningful_license(value: str | None) -> str | None:
    if value is None or value.strip().lower() in _UNKNOWN_LICENSES:
        return None
    return value.strip()


def _catalog_model_license(model: Model, profile: ModelProfile | None) -> str | None:
    availability = (profile.availability if profile else None) or ""
    availability = availability.strip().lower().replace("-", "_")
    license_name = _meaningful_license((profile.license if profile else None) or model.license)
    if availability == "proprietary" or model.is_open_weight is False:
        return "Proprietary"
    if availability == "open_weight" or model.is_open_weight is True:
        return license_name or "Open"
    return license_name


def _known_family_license(model_name: str, organization: str) -> str | None:
    """Use only family-level rules whose public/closed distribution is unambiguous."""
    name = _normalized_model_label(model_name)
    org = organization.strip().lower().replace(" ", "")
    if name in _NOT_APPLICABLE_BENCHMARK_ENTRIES:
        return "Not applicable"
    if verified := _VERIFIED_MODEL_LICENSES.get(name):
        return verified
    if name.startswith("inkling"):
        return "Apache-2.0"
    if name.startswith("athene-v2-chat"):
        return "Open"
    if name.startswith("mimo-v2-flash"):
        return "MIT"
    if name.startswith("pine voice preview"):
        return "Proprietary"
    if name.startswith("motif 3"):
        return "MIT"
    if name.startswith("muse glimmer"):
        return "Open"
    if name.startswith("muse spark"):
        return "Proprietary"
    if "gpt-oss" in name:
        return "Open"
    if org in {"anthropic"} and "claude" in name:
        return "Proprietary"
    if org in {"openai"} and ("gpt" in name or name.startswith(("o1", "o3", "o4"))):
        return "Proprietary"
    if org in {"google", "gemini"} and "gemini" in name:
        return "Proprietary"
    if "grok" in name and org in {"xai", "spacexai", "pickle"}:
        return "Open" if name in {"grok-1", "grok 1"} else "Proprietary"
    if "qwen" in name:
        return "Proprietary" if any(tier in name for tier in ("max", "plus", "turbo")) else "Open"
    if (org in {"zai", "zhipuai"} or "zhipu" in org) and "glm" in name:
        return "MIT"
    if name.startswith("glm-5.2"):
        return "MIT"
    if name.startswith("xai-realtime"):
        return "Proprietary"
    legacy_open_weight_prefixes = (
        "aya-expanse-",
        "c4ai-command-r-",
        "granite-",
        "internmath-",
        "jamba-1.5-",
        "magnum-",
        "mammoth2-",
        "mathstral-",
        "ministral-",
        "mistral-",
        "mixtral-",
        "neo-7b-",
        "openchat-",
        "phi-3.",
        "phi3-",
        "rrd2.5-",
        "staring-7b",
        "wizardlm-",
        "yi-1.5-",
        "yi-34b",
        "yi-6b-",
        "zephyr-",
    )
    if name.startswith(legacy_open_weight_prefixes):
        return "Open"
    if name.startswith("seed1.6") or name.startswith("seed2.0") or name.startswith("seed-thinking"):
        return "Proprietary"
    if name in {
        "hunyuan-t1",
        "hunyunturbos",
        "hunyuanturbos",
        "hunyuan turbos",
    }:
        return "Proprietary"
    if name.startswith("doubao-"):
        return "Proprietary"
    open_family_signals = (
        "deepseek",
        "exaone",
        "gemma",
        "kimi-k2",
        "llama",
        "nemotron",
        "opencodereasoning",
        "openreasoning",
        "phi-4",
        "qwq",
        "seed-oss",
    )
    if any(signal in name for signal in open_family_signals):
        return "Open"
    return None


def _known_open_source_family(model_name: str) -> bool:
    name = _normalized_model_label(model_name)
    return any(
        name.startswith(prefix) or f"/{prefix}" in name
        for prefix in _KNOWN_OPEN_SOURCE_FAMILY_PREFIXES
    )


def _resolved_availability(model: Model, profile: ModelProfile | None) -> str | None:
    if profile is not None:
        if profile.availability:
            return profile.availability
        if profile.openness and profile.openness != "unknown":
            return profile.openness
    if model.is_open_weight is True:
        return "open_weight"
    if model.is_open_weight is False:
        return "proprietary"
    return None


def _resolved_compare_license(
    model: Model,
    company: Company,
    profile: ModelProfile | None,
) -> str | None:
    license_name = _catalog_model_license(model, profile)
    if license_name and license_name.strip().lower() not in {"", "unknown"}:
        return license_name
    family_license = _known_family_license(model.name, company.name)
    if family_license:
        return family_license
    return license_name


def _resolved_compare_openness(
    model: Model,
    company: Company,
    profile: ModelProfile | None,
) -> str | None:
    if profile is not None and profile.openness and profile.openness != "unknown":
        return profile.openness
    if _known_open_source_family(model.name):
        return "open_source"
    availability = _resolved_availability(model, profile)
    if availability:
        return availability
    license_name = _resolved_compare_license(model, company, profile)
    if license_name is None:
        return None
    normalized = license_name.strip().lower()
    if normalized in {"proprietary", "not applicable"}:
        return "proprietary"
    if normalized in {"open", "mit", "apache-2.0"} or "apache" in normalized:
        return "open_weight" if normalized == "open" else "open_source"
    return None
