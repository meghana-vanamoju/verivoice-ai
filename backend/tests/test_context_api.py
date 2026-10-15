from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_analyze_context_endpoint_returns_findings_and_guidance():
    response = client.post(
        "/api/v1/context/analyze",
        json={
            "context": "The invoice payment details have been changed.",
            "transcript": "Please wire the funds immediately.",
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert [finding["code"] for finding in result["findings"]] == [
        "URGENCY",
        "MONEY_TRANSFER",
        "PAYMENT_DETAILS_CHANGED",
    ]
    assert result["score"] == 80
    assert result["level"] == "critical"
    assert result["guidance"]


def test_analyze_context_endpoint_rejects_missing_context():
    response = client.post(
        "/api/v1/context/analyze",
        json={"transcript": "Please wire the funds."},
    )

    assert response.status_code == 422


def test_analyze_context_endpoint_rejects_non_string_transcript():
    response = client.post(
        "/api/v1/context/analyze",
        json={"context": "A caller", "transcript": 7},
    )

    assert response.status_code == 422


def test_frontend_origin_is_allowed_by_cors():
    response = client.options(
        "/api/v1/context/analyze",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
