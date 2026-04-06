# backend/tests/integration/test_admin_routes.py
from unittest.mock import patch

import pytest

from tests.conftest import unique_email


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _regular_token(client) -> str:
    email = unique_email("regular")
    password = "RegularPass123!"
    await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    r = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return r.json()["access_token"]


async def test_admin_cleanup_requires_auth(client):
    r = await client.post("/api/v1/admin/cleanup")
    assert r.status_code == 401


async def test_admin_cleanup_requires_superuser(client):
    token = await _regular_token(client)
    r = await client.post("/api/v1/admin/cleanup", headers=_auth(token))
    assert r.status_code == 403


async def test_admin_cleanup_returns_deleted_count(client, superuser_token):
    with patch("app.api.routes.admin.cleanup_old_uploads", return_value=7):
        r = await client.post("/api/v1/admin/cleanup", headers=_auth(superuser_token))
    assert r.status_code == 200
    assert r.json()["deleted_count"] == 7
