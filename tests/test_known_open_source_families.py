from types import SimpleNamespace

from llm_radar.api.routes import _known_open_source_family, _resolved_compare_openness


def test_known_open_source_families_are_detected() -> None:
    assert _known_open_source_family("Olmo 3 32B Think") is True
    assert _known_open_source_family("allenai/Olmo-3.1-32B-Instruct") is True
    assert _known_open_source_family("olmo2") is True
    assert _known_open_source_family("Pythia 12B") is True
    assert _known_open_source_family("pythia-160m") is True
    assert _known_open_source_family("bigcode/starcoder2-15b-instruct-v0.1") is True
    assert _known_open_source_family("starcoder2") is True
    assert _known_open_source_family("smollm2") is True
    assert _known_open_source_family("K2-Think") is True


def test_unrelated_models_are_not_flagged_open_source() -> None:
    assert _known_open_source_family("Claude Opus 4.5") is False
    assert _known_open_source_family("GPT-5.2") is False
    assert _known_open_source_family("Qwen3.5-397B-A17B") is False


def test_resolved_compare_openness_uses_known_open_source_family_as_fallback() -> None:
    model = SimpleNamespace(name="Olmo 3 32B Think")
    company = SimpleNamespace(name="Allen Institute for AI", slug="allenai")
    profile = SimpleNamespace(openness=None, availability=None, license=None)

    assert _resolved_compare_openness(model, company, profile) == "open_source"


def test_resolved_compare_openness_never_overrides_an_asserted_value() -> None:
    """A source-asserted openness value always wins over the curated family
    fallback - the fallback only fires when nothing else is known."""
    model = SimpleNamespace(name="Olmo 3 32B Think")
    company = SimpleNamespace(name="Allen Institute for AI", slug="allenai")
    profile = SimpleNamespace(openness="open_weight", availability=None, license=None)

    assert _resolved_compare_openness(model, company, profile) == "open_weight"
