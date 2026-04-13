# backend/tests/integration/test_admin_routes.py
import pytest
from httpx import AsyncClient

from tests.conftest import unique_email


async def _register(client: AsyncClient, email: str, password: str = "Pass123!") -> dict:
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.json()
    return r.json()


async def _login(client: AsyncClient, email: str, password: str = "Pass123!") -> str:
    r = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200, r.json()
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── User list ─────────────────────────────────────────────────────────────────

async def test_list_users_requires_superuser(client, superuser_token):
    regular_email = unique_email("regular")
    await _register(client, regular_email)
    regular_token = await _login(client, regular_email)
    r = await client.get("/api/v1/admin/users", headers=_auth(regular_token))
    assert r.status_code == 403

    r = await client.get("/api/v1/admin/users", headers=_auth(superuser_token))
    assert r.status_code == 200


async def test_list_users_returns_paginated_response(client, superuser_token):
    r = await client.get("/api/v1/admin/users", headers=_auth(superuser_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "next_cursor" in body
    assert "has_more" in body


async def test_list_users_search(client, superuser_token):
    email = unique_email("searchable")
    await _register(client, email)
    r = await client.get(
        "/api/v1/admin/users", params={"search": email[:15]}, headers=_auth(superuser_token)
    )
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()["items"]]
    assert email in emails


# ── Update user ───────────────────────────────────────────────────────────────

async def test_patch_user_deactivate(client, superuser_token):
    email = unique_email("patchme")
    user = await _register(client, email)
    user_id = user["id"]

    r = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        json={"is_active": False},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is False


async def test_patch_user_promote(client, superuser_token):
    email = unique_email("promoteme")
    user = await _register(client, email)
    r = await client.patch(
        f"/api/v1/admin/users/{user['id']}",
        json={"is_superuser": True},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 200
    assert r.json()["is_superuser"] is True


async def test_patch_user_not_found(client, superuser_token):
    r = await client.patch(
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000000",
        json={"is_active": False},
        headers=_auth(superuser_token),
    )
    assert r.status_code == 404


# ── Delete user ───────────────────────────────────────────────────────────────

async def test_delete_user(client, superuser_token):
    email = unique_email("deleteme")
    user = await _register(client, email)
    r = await client.delete(
        f"/api/v1/admin/users/{user['id']}", headers=_auth(superuser_token)
    )
    assert r.status_code == 204

    # Confirm gone
    r2 = await client.get("/api/v1/admin/users", params={"search": email}, headers=_auth(superuser_token))
    assert not any(u["email"] == email for u in r2.json()["items"])


async def test_delete_user_not_found(client, superuser_token):
    r = await client.delete(
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000000",
        headers=_auth(superuser_token),
    )
    assert r.status_code == 404


# ── User stats ────────────────────────────────────────────────────────────────

async def test_get_user_stats(client, superuser_token):
    email = unique_email("stats")
    user = await _register(client, email)
    r = await client.get(
        f"/api/v1/admin/users/{user['id']}/stats", headers=_auth(superuser_token)
    )
    assert r.status_code == 200
    body = r.json()
    assert body["recipe_count"] == 0
    assert body["meal_plan_count"] == 0
    assert body["last_active"] is None


# ── Cleanup ───────────────────────────────────────────────────────────────────

async def test_cleanup_writes_audit_log(client, superuser_token, db_engine):
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.admin import AdminAuditLog

    r = await client.post("/api/v1/admin/cleanup", headers=_auth(superuser_token))
    assert r.status_code == 200
    assert "deleted_count" in r.json()

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as db:
        result = await db.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "CLEANUP")
        )
        assert result.scalars().first() is not None


# ── Log routes ────────────────────────────────────────────────────────────────

async def test_get_app_logs(client, superuser_token, tmp_path, monkeypatch):
    import json
    from app.core import config as cfg
    log_file = tmp_path / "app.log"
    log_file.write_text(
        json.dumps({"timestamp": "2026-04-13T00:00:00Z", "level": "INFO",
                    "method": "GET", "path": "/api/v1/recipes",
                    "status_code": 200, "latency_ms": 5, "user_id": None}) + "\n"
    )
    monkeypatch.setattr(cfg.settings, "APP_LOG_FILE", str(log_file))

    r = await client.get("/api/v1/admin/logs/app", headers=_auth(superuser_token))
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1
    assert r.json()["items"][0]["path"] == "/api/v1/recipes"


async def test_get_ai_logs(client, superuser_token):
    r = await client.get("/api/v1/admin/logs/ai", headers=_auth(superuser_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "next_cursor" in body
    assert "has_more" in body


async def test_get_audit_logs(client, superuser_token):
    # Trigger a real audit event first
    email = unique_email("auditee")
    user = await _register(client, email)
    await client.patch(
        f"/api/v1/admin/users/{user['id']}",
        json={"is_active": False},
        headers=_auth(superuser_token),
    )
    r = await client.get("/api/v1/admin/logs/audit", headers=_auth(superuser_token))
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(i["action"] == "DEACTIVATE" for i in items)
    assert all("description" in i for i in items)
