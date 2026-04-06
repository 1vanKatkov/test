from app.services import compatibility, sonnik, tarot


def test_auth_verify(client, auth_headers_builder):
    body = {}
    response = client.post("/api/auth/max/verify", json=body, headers=auth_headers_builder(body))
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "balance" in data


def test_sonnik_endpoint_with_mock(client, monkeypatch, auth_headers_builder):
    monkeypatch.setattr(sonnik, "interpret_dream", lambda _: "mock interpretation")
    body = {"dream_text": "test dream"}
    response = client.post("/api/sonnik/interpret", json=body, headers=auth_headers_builder(body))
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["interpretation"] == "mock interpretation"


def test_compatibility_endpoint_with_mock(client, monkeypatch, auth_headers_builder):
    monkeypatch.setattr(compatibility, "by_names", lambda *_: "compatibility text")
    body = {"name1": "Ivan", "name2": "Maria"}
    response = client.post("/api/sovmestimost/by-names", json=body, headers=auth_headers_builder(body))
    assert response.status_code == 200
    assert response.json()["result"] == "compatibility text"


def test_tarot_endpoint_with_mock(client, monkeypatch, auth_headers_builder):
    monkeypatch.setattr(tarot, "tarot_reading", lambda *_: {"cards": ["The Sun"], "interpretation": "tarot text"})
    body = {"question": "What should I focus on?", "spread_size": 1}
    response = client.post("/api/tarot/reading", json=body, headers=auth_headers_builder(body))
    assert response.status_code == 200
    data = response.json()
    assert data["cards"] == ["The Sun"]
    assert data["interpretation"] == "tarot text"
