from llm_radar.api.routes_models import _search_term_variants


def test_search_term_variants_include_compact_and_separated_forms() -> None:
    variants = _search_term_variants("open ai")
    assert "open ai" in variants
    assert "openai" in variants
    assert "open-ai" in variants
    assert "open_ai" in variants


def test_search_term_variants_collapse_whitespace() -> None:
    assert _search_term_variants("  open   ai  ") == _search_term_variants("open ai")


def test_search_term_variants_empty() -> None:
    assert _search_term_variants("") == []
    assert _search_term_variants("   ") == []
