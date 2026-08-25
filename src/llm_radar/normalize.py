import re
import unicodedata
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

_COMPANY_ALIASES = {
    "openai": "openai",
    "open ai": "openai",
    "anthropic": "anthropic",
    "google": "google",
    "google deepmind": "google",
    "deepmind": "google",
    "xai": "xai",
    "x.ai": "xai",
    "meta": "meta",
    "meta ai": "meta",
    "facebook": "meta",
    "deepseek": "deepseek",
    "qwen": "qwen",
    "alibaba": "qwen",
    "moonshot": "moonshot",
    "moonshot ai": "moonshot",
    "kimi": "moonshot",
    "mistral": "mistral",
    "mistral ai": "mistral",
    "z.ai": "zai",
    "zai": "zai",
    "zhipu": "zai",
    "minimax": "minimax",
    "nvidia": "nvidia",
}

_LICENSE_ALIASES = {
    "mit": "MIT",
    "apache-2.0": "Apache-2.0",
    "apache 2": "Apache-2.0",
    "llama 3": "Llama-3",
    "llama3": "Llama-3",
    "gemma": "Gemma",
    "proprietary": "proprietary",
}

_MODALITY_ALIASES = {
    "text": "text",
    "image": "image",
    "vision": "image",
    "audio": "audio",
    "speech": "audio",
    "video": "video",
    "file": "file",
}


def ascii_fold(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()


def slugify(value: str) -> str:
    folded = ascii_fold(value).lower().strip()
    folded = re.sub(r"[^a-z0-9]+", "-", folded)
    return folded.strip("-")


def normalize_company_name(value: str) -> str:
    key = re.sub(r"\s+", " ", ascii_fold(value).lower()).strip()
    return _COMPANY_ALIASES.get(key, slugify(value))


def normalize_license(value: str | None) -> str | None:
    if not value:
        return None
    key = value.strip().lower()
    return _LICENSE_ALIASES.get(key, value.strip())


def normalize_modalities(values: list[str] | None) -> list[str]:
    seen: list[str] = []
    for item in values or []:
        mapped = _MODALITY_ALIASES.get(item.strip().lower(), item.strip().lower())
        if mapped and mapped not in seen:
            seen.append(mapped)
    return seen


def to_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def usd_per_million(value: Any, *, assumed_unit: str = "per_token") -> Decimal | None:
    amount = to_decimal(value)
    if amount is None:
        return None
    if assumed_unit in {"per_token", "token"}:
        return amount * Decimal("1000000")
    if assumed_unit in {"per_1k", "per_1k_tokens"}:
        return amount * Decimal("1000")
    return amount


def parse_utc_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    parsed = parse_utc_datetime(value)
    if parsed:
        return parsed.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def mark_missing(payload: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    missing = [field for field in fields if payload.get(field) in (None, "", [], {})]
    annotated = dict(payload)
    annotated["_missing_fields"] = missing
    return annotated
