# backend/tests/integration/test_meal_plan_routes.py
import pytest
from tests.conftest import unique_email


async def _auth_token(client, password: str = "SecurePass123!") -> str:
    email = unique_email("mealplan")
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


# ── Create ────────────────────────────────────────────────────────────────────

async def test_create_meal_plan_requires_auth(client):
    r = await client.post("/api/v1/meal-plans", json={
        "name": "Week 1", "start_date": "2026-04-07", "end_date": "2026-04-13"
    })
    assert r.status_code == 401


async def test_create_meal_plan_returns_draft(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/meal-plans", json={
        "name": "Week 1", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Week 1"
    assert data["status"] == "draft"
    assert data["start_date"] == "2026-04-07"
    assert "id" in data


# ── List ──────────────────────────────────────────────────────────────────────

async def test_list_meal_plans(client):
    token = await _auth_token(client)
    await client.post("/api/v1/meal-plans", json={
        "name": "Plan A", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    r = await client.get("/api/v1/meal-plans", headers=_auth(token))
    assert r.status_code == 200
    assert len(r.json()) >= 1
    assert r.json()[0]["name"] == "Plan A"


async def test_list_meal_plans_isolation(client):
    """User A cannot see User B's plans."""
    token_a = await _auth_token(client)
    token_b = await _auth_token(client)
    await client.post("/api/v1/meal-plans", json={
        "name": "B Plan", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token_b))
    r = await client.get("/api/v1/meal-plans", headers=_auth(token_a))
    assert all(p["name"] != "B Plan" for p in r.json())


# ── Get ───────────────────────────────────────────────────────────────────────

async def test_get_meal_plan_with_entries(client):
    token = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "Detail", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = create_r.json()["id"]
    r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["id"] == plan_id
    assert "entries" in r.json()


async def test_get_meal_plan_404_other_user(client):
    token_a = await _auth_token(client)
    token_b = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "A Plan", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token_a))
    plan_id = create_r.json()["id"]
    r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers=_auth(token_b))
    assert r.status_code == 404


# ── Confirm ───────────────────────────────────────────────────────────────────

async def test_confirm_meal_plan(client):
    token = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "Confirm Test", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = create_r.json()["id"]
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/confirm", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["status"] == "active"


async def test_confirm_already_active_returns_400(client):
    token = await _auth_token(client)
    create_r = await client.post("/api/v1/meal-plans", json={
        "name": "Double Confirm", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    plan_id = create_r.json()["id"]
    await client.post(f"/api/v1/meal-plans/{plan_id}/confirm", headers=_auth(token))
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/confirm", headers=_auth(token))
    assert r.status_code == 400
