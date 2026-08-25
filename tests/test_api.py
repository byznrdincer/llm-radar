from fastapi.testclient import TestClient

from llm_radar.api.main import app


def test_health_endpoint() -> None:
    response = TestClient(app, base_url="http://localhost").get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_contains_core_data_routes() -> None:
    schema = TestClient(app, base_url="http://localhost").get("/openapi.json").json()

    assert "/api/v1/stats" in schema["paths"]
    assert "/api/v1/models" in schema["paths"]
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
