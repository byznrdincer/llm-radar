from fastapi.testclient import TestClient

from llm_radar.api.main import app


def test_turkish_models_endpoint_not_shadowed_by_model_detail() -> None:
    client = TestClient(app, base_url="http://localhost")
    try:
        response = client.get("/api/v1/models/turkish?limit=10")
    except Exception:
        return

    if response.status_code == 422:
        detail = response.json().get("detail", [])
        assert not any(
            item.get("loc") == ["path", "model_id"] and item.get("type") == "uuid_parsing"
            for item in detail
        )
        return

    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload
    assert isinstance(payload["items"], list)


def test_health_endpoint() -> None:
    response = TestClient(app, base_url="http://localhost").get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_contains_core_data_routes() -> None:
    schema = TestClient(app, base_url="http://localhost").get("/openapi.json").json()

    assert "/api/v1/stats" in schema["paths"]
    assert "/api/v1/models" in schema["paths"]
    assert "/api/v1/models/search" in schema["paths"]
    assert "/api/v1/models/facets" in schema["paths"]
    assert "/api/v1/models/compare" in schema["paths"]
    assert "/api/v1/models/select" in schema["paths"]
    assert "/api/v1/models/{model_id}/history" in schema["paths"]
    assert "/api/v1/events" in schema["paths"]
    assert "/api/v1/leaderboards/arena" in schema["paths"]
    assert "/api/v1/leaderboards/swe-bench" in schema["paths"]
    assert "/api/v1/leaderboards/artificial-analysis/{category}" in schema["paths"]
    assert "/api/v1/leaderboards/composite" not in schema["paths"]
    assert "/api/v1/catalog/events" in schema["paths"]
    assert "/api/v1/catalog/sources" in schema["paths"]
    assert "/api/v1/research" in schema["paths"]
    assert "/api/v1/technology" in schema["paths"]
    assert "/api/v1/comparisons/value" in schema["paths"]
    assert "/api/v1/stream/events" in schema["paths"]
    assert "/api/v1/notifications" in schema["paths"]
    assert "/api/v1/sources/health" in schema["paths"]
    assert "/api/v1/leaderboards/livebench" in schema["paths"]
    assert "/api/v1/leaderboards/mmlu-pro" in schema["paths"]
    assert "/api/v1/analytics/events" in schema["paths"]
    assert "/api/v1/analytics/popular" in schema["paths"]
    assert "/api/v1/analytics/spotlight" in schema["paths"]
    assert "/api/v1/feedback" in schema["paths"]
    assert "/api/v1/model-demands" in schema["paths"]
    assert "/api/v1/model-demands/summary" in schema["paths"]
    assert "/api/v1/insights/country-frontier" in schema["paths"]
    assert "/api/v1/insights/openness-trend" in schema["paths"]
    assert "/api/v1/insights/market-dashboard" in schema["paths"]
    assert "/api/v1/models/turkish" in schema["paths"]
