from types import SimpleNamespace
from typing import Any, cast

from sqlalchemy.orm import Session

from llm_radar.catalog_resolution import _catalog_model_name_candidates, _resolve_catalog_model
from llm_radar.composite import canonical_model_name


class _EmptyFallbackSession:
    """Stands in for the DB session when a test expects the catalog-index
    tiers alone to decide the outcome without falling through to real SQL."""

    def scalar(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def execute(self, *_args: Any, **_kwargs: Any) -> Any:
        return SimpleNamespace(all=lambda: [])


def test_compound_benchmark_name_prefers_the_underlying_model() -> None:
    assert _catalog_model_name_candidates("AMI Agent + Claude-4.6-Opus") == [
        "Claude-4.6-Opus",
        "AMI Agent",
        "AMI Agent + Claude-4.6-Opus",
    ]


def test_ambiguous_canonical_name_across_companies_is_not_guessed() -> None:
    """A shared canonical name across distinct companies (e.g. a GGUF
    re-upload vs. the original creator) must not be silently attributed to
    whichever one happens to come first when the organization doesn't
    confirm either candidate."""
    original = SimpleNamespace(id="cohere-command-a")
    reupload = SimpleNamespace(id="ollama-command-a")
    catalog_index = {
        canonical_model_name("Command A"): [
            (original, None, "Cohere"),
            (reupload, None, "Ollama"),
        ],
    }

    resolved = _resolve_catalog_model(
        cast(Session, cast(Any, _EmptyFallbackSession())),
        "Command A",
        "SomeOtherBenchmarkVendor",
        catalog_index,
    )

    assert resolved is None


def test_ambiguous_canonical_name_resolves_when_organization_confirms_one() -> None:
    original = SimpleNamespace(id="cohere-command-a")
    reupload = SimpleNamespace(id="ollama-command-a")
    catalog_index = {
        canonical_model_name("Command A"): [
            (original, None, "Cohere"),
            (reupload, None, "Ollama"),
        ],
    }

    resolved = _resolve_catalog_model(
        cast(Session, cast(Any, None)),
        "Command A",
        "Cohere",
        catalog_index,
    )

    assert resolved is original


def test_compound_benchmark_entry_resolves_to_catalog_model() -> None:
    claude = SimpleNamespace(id="claude-model")
    catalog_index = {
        canonical_model_name("Claude Opus 4.6"): [(claude, None, "Anthropic")],
    }

    resolved = _resolve_catalog_model(
        cast(Session, cast(Any, None)),
        "AMI Agent + Claude-4.6-Opus",
        "Anthropic",
        catalog_index,
    )

    assert resolved is claude
