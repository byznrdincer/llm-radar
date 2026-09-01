from llm_radar.api.routes import _capability_filter_clause, _normalize_sort_specs


def test_normalize_sort_specs_pairs_fields_and_orders() -> None:
    assert _normalize_sort_specs(["context", "input_price"], ["desc", "asc"]) == [
        ("context", "desc"),
        ("input_price", "asc"),
    ]


def test_normalize_sort_specs_defaults_to_name_asc() -> None:
    assert _normalize_sort_specs(None, None) == [("name", "asc")]


def test_capability_filter_clause_maps_reasoning() -> None:
    clause = _capability_filter_clause("reasoning")
    assert clause is not None


def test_capability_filter_clause_normalizes_function_calling() -> None:
    clause = _capability_filter_clause("function_calling")
    assert clause is not None
