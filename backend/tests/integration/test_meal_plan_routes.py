# backend/tests/integration/test_meal_plan_routes.py
from unittest.mock import AsyncMock, patch

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


# ── Entries ───────────────────────────────────────────────────────────────────

async def _create_plan(client, token: str) -> str:
    r = await client.post("/api/v1/meal-plans", json={
        "name": "Entry Test", "start_date": "2026-04-07", "end_date": "2026-04-13"
    }, headers=_auth(token))
    assert r.status_code == 201
    return r.json()["id"]


async def test_create_entry_freetext(client):
    token = await _auth_token(client)
    plan_id = await _create_plan(client, token)
    r = await client.post(f"/api/v1/meal-plans/{plan_id}/entries", json={
        "date": "2026-04-07",
        "meal_type": "dinner",
        "note": "Restaurant X",
        "entry_type": "freetext",
    }, headers=_auth(token))
    assert r.status_code == 201
    assert r.json()["note"] == "Restaurant X"
    assert r.json()["entry_type"] == "freetext"


async def test_create_entry_404_wrong_plan(client):
    token = await _auth_token(client)
    other_token = await _auth_token(client)
    other_plan_id = await _create_plan(client, other_token)
    r = await client.post(f"/api/v1/meal-plans/{other_plan_id}/entries", json={
        "date": "2026-04-07", "meal_type": "dinner",
        "note": "Test", "entry_type": "freetext",
    }, headers=_auth(token))
    assert r.status_code == 404


async def test_update_entry(client):
    token = await _auth_token(client)
    plan_id = await _create_plan(client, token)
    create_r = await client.post(f"/api/v1/meal-plans/{plan_id}/entries", json={
        "date": "2026-04-07", "meal_type": "dinner",
        "note": "First note", "entry_type": "freetext",
    }, headers=_auth(token))
    entry_id = create_r.json()["id"]
    r = await client.patch(f"/api/v1/meal-plans/{plan_id}/entries/{entry_id}", json={
        "note": "Updated note",
    }, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["note"] == "Updated note"


async def test_delete_entry(client):
    token = await _auth_token(client)
    plan_id = await _create_plan(client, token)
    create_r = await client.post(f"/api/v1/meal-plans/{plan_id}/entries", json={
        "date": "2026-04-07", "meal_type": "dinner",
        "note": "To delete", "entry_type": "freetext",
    }, headers=_auth(token))
    entry_id = create_r.json()["id"]
    r = await client.delete(
        f"/api/v1/meal-plans/{plan_id}/entries/{entry_id}", headers=_auth(token)
    )
    assert r.status_code == 204
    # verify gone
    detail_r = await client.get(f"/api/v1/meal-plans/{plan_id}", headers=_auth(token))
    assert all(e["id"] != entry_id for e in detail_r.json()["entries"])


# ── Suggestions ───────────────────────────────────────────────────────────────

async def test_suggestions_returns_202_with_task_id(client):
    token = await _auth_token(client)
    with patch(
        "app.api.routes.meal_plans.process_suggestions_task",
        AsyncMock(),  # prevent background task from actually running
    ):
        r = await client.post("/api/v1/meal-plans/suggestions", json={}, headers=_auth(token))
    assert r.status_code == 202
    assert "task_id" in r.json()
    assert r.json()["status"] == "pending"


async def test_suggestions_task_can_be_polled(client):
    token = await _auth_token(client)
    with patch(
        "app.api.routes.meal_plans.process_suggestions_task",
        AsyncMock(),  # prevent background task from actually running
    ):
        r = await client.post("/api/v1/meal-plans/suggestions", json={}, headers=_auth(token))
    task_id = r.json()["task_id"]
    poll_r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token))
    assert poll_r.status_code == 200
    assert poll_r.json()["id"] == task_id
