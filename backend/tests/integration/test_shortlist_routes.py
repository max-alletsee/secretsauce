# backend/tests/integration/test_shortlist_routes.py
import pytest
from tests.conftest import unique_email


async def _auth_token(client) -> str:
    email = unique_email("shortlist")
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": "Pass123!"})
    assert reg.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "Pass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_shortlist_empty_by_default(client):
    token = await _auth_token(client)
    r = await client.get("/api/v1/meal-plans/shortlist", headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == []


async def test_add_suggestion_to_shortlist(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/meal-plans/shortlist", json={
        "note": "Shakshuka", "entry_type": "suggestion"
    }, headers=_auth(token))
    assert r.status_code == 201
    assert r.json()["note"] == "Shakshuka"
    assert r.json()["entry_type"] == "suggestion"


async def test_remove_from_shortlist(client):
    token = await _auth_token(client)
    add_r = await client.post("/api/v1/meal-plans/shortlist", json={
        "note": "To remove", "entry_type": "suggestion"
    }, headers=_auth(token))
    entry_id = add_r.json()["id"]
    r = await client.delete(f"/api/v1/meal-plans/shortlist/{entry_id}", headers=_auth(token))
    assert r.status_code == 204
    list_r = await client.get("/api/v1/meal-plans/shortlist", headers=_auth(token))
    assert all(e["id"] != entry_id for e in list_r.json())


async def test_reorder_shortlist(client):
    token = await _auth_token(client)
    a = (await client.post("/api/v1/meal-plans/shortlist", json={
        "note": "A", "entry_type": "suggestion"
    }, headers=_auth(token))).json()["id"]
    b = (await client.post("/api/v1/meal-plans/shortlist", json={
        "note": "B", "entry_type": "suggestion"
    }, headers=_auth(token))).json()["id"]
    r = await client.patch("/api/v1/meal-plans/shortlist/reorder", json={
        "ordered_ids": [b, a]
    }, headers=_auth(token))
    assert r.status_code == 200
    list_r = await client.get("/api/v1/meal-plans/shortlist", headers=_auth(token))
    ids = [e["id"] for e in list_r.json()]
    assert ids.index(b) < ids.index(a)


async def test_shortlist_isolation(client):
    token_a = await _auth_token(client)
    token_b = await _auth_token(client)
    await client.post("/api/v1/meal-plans/shortlist", json={
        "note": "B only", "entry_type": "suggestion"
    }, headers=_auth(token_b))
    r = await client.get("/api/v1/meal-plans/shortlist", headers=_auth(token_a))
    assert all(e["note"] != "B only" for e in r.json())
