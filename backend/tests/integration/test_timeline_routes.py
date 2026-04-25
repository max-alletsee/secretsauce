# backend/tests/integration/test_timeline_routes.py
from datetime import date

from tests.conftest import unique_email


async def _auth_token(client, password: str = "SecurePass123!") -> str:
    email = unique_email("timeline")
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.json()
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_list_timeline_entries_empty(client):
    token = await _auth_token(client)
    today = date.today().isoformat()
    response = await client.get(
        f"/api/v1/timeline/entries?from_date={today}&to_date={today}",
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json() == {"entries": []}


async def test_create_and_list_timeline_entry(client):
    token = await _auth_token(client)
    today = date.today().isoformat()
    create_resp = await client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "dinner", "entry_type": "freetext", "note": "Pizza night"},
        headers=_auth(token),
    )
    assert create_resp.status_code == 201
    entry = create_resp.json()
    assert entry["date"] == today
    assert entry["meal_type"] == "dinner"
    assert entry["note"] == "Pizza night"
    assert entry["meal_plan_id"] is None

    list_resp = await client.get(
        f"/api/v1/timeline/entries?from_date={today}&to_date={today}",
        headers=_auth(token),
    )
    assert list_resp.status_code == 200
    entries = list_resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["id"] == entry["id"]


async def test_update_timeline_entry(client):
    token = await _auth_token(client)
    today = date.today().isoformat()
    entry = (await client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "lunch", "entry_type": "freetext", "note": "Salad"},
        headers=_auth(token),
    )).json()

    patch_resp = await client.patch(
        f"/api/v1/timeline/entries/{entry['id']}",
        json={"note": "Caesar Salad", "servings": 3},
        headers=_auth(token),
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["note"] == "Caesar Salad"
    assert updated["servings"] == 3


async def test_delete_timeline_entry(client):
    token = await _auth_token(client)
    today = date.today().isoformat()
    entry = (await client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "breakfast", "entry_type": "freetext", "note": "Eggs"},
        headers=_auth(token),
    )).json()

    del_resp = await client.delete(
        f"/api/v1/timeline/entries/{entry['id']}",
        headers=_auth(token),
    )
    assert del_resp.status_code == 204

    list_resp = await client.get(
        f"/api/v1/timeline/entries?from_date={today}&to_date={today}",
        headers=_auth(token),
    )
    assert list_resp.json()["entries"] == []


async def test_cannot_access_other_users_entry(client):
    token_a = await _auth_token(client)
    token_b = await _auth_token(client)
    today = date.today().isoformat()
    entry = (await client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "dinner", "entry_type": "freetext", "note": "Mine"},
        headers=_auth(token_a),
    )).json()

    resp = await client.delete(
        f"/api/v1/timeline/entries/{entry['id']}",
        headers=_auth(token_b),
    )
    assert resp.status_code == 404
