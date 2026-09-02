from types import SimpleNamespace
from typing import Any, cast

from sqlalchemy.orm import Session

from llm_radar.api.routes import _catalog_model_name_candidates, _resolve_catalog_model
from llm_radar.composite import canonical_model_name


def test_compound_benchmark_name_prefers_the_underlying_model() -> None:
    assert _catalog_model_name_candidates("AMI Agent + Claude-4.6-Opus") == [
        "Claude-4.6-Opus",
        "AMI Agent",
        "AMI Agent + Claude-4.6-Opus",
    ]


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
