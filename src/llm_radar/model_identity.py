from __future__ import annotations

import re

from llm_radar.normalize import normalize_company_name

_PROVIDER_VARIANT = re.compile(r":(?:batch|free|nitro|floor|online|exacto)$", re.IGNORECASE)
_PRECISION_VARIANT = re.compile(
    r"-(?:bf16|fp16|fp8|fp4|nvfp4|int8|int4|awq|gptq|gguf|mlx)$",
    re.IGNORECASE,
)


def model_variant_identity(slug: str) -> str:
    """Return the underlying model identity without hosting or precision suffixes."""
    normalized = slug.strip().lower().strip("/")
    if "/" in normalized:
        owner, model_name = normalized.split("/", 1)
        owner = normalize_company_name(owner)
    else:
        owner, model_name = "", normalized

    previous = None
    while previous != model_name:
        previous = model_name
        model_name = _PROVIDER_VARIANT.sub("", model_name)
        model_name = _PRECISION_VARIANT.sub("", model_name)
    return f"{owner}/{model_name}" if owner else model_name
