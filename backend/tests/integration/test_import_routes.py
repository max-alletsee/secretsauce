# backend/tests/integration/test_import_routes.py
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models.import_task import ImportTask, ImportTaskStatus
from tests.conftest import unique_email

# Minimal valid JPEG bytes (header only, enough for content-type check)
_MINIMAL_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _auth_token(client, password: str = "SecurePass123!") -> str:
    email = unique_email("import")
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


# ── POST /api/v1/recipes/import/url ──────────────────────────────────────────

async def test_import_url_requires_auth(client):
    r = await client.post(
        "/api/v1/recipes/import/url", json={"url": "https://example.com/recipe"}
    )
    assert r.status_code == 401


async def test_import_url_rejects_invalid_url(client):
    token = await _auth_token(client)
    r = await client.post(
        "/api/v1/recipes/import/url",
        json={"url": "not-a-url"},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_import_url_returns_202_and_creates_task(client):
    token = await _auth_token(client)
    with patch(
        "app.api.routes.import_tasks.process_url_import",
        AsyncMock(),  # prevent background task from actually running
    ):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/recipe"},
            headers=_auth(token),
        )
    assert r.status_code == 202
    data = r.json()
    assert "task_id" in data
    assert data["status"] == "pending"
    # task_id should be a valid UUID
    uuid.UUID(data["task_id"])


# ── GET /api/v1/import-tasks/{task_id} ───────────────────────────────────────

async def test_get_import_task_requires_auth(client):
    r = await client.get(f"/api/v1/import-tasks/{uuid.uuid4()}")
    assert r.status_code == 401


async def test_get_import_task_returns_404_for_unknown_id(client):
    token = await _auth_token(client)
    r = await client.get(
        f"/api/v1/import-tasks/{uuid.uuid4()}",
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_get_import_task_returns_404_for_other_users_task(client):
    # User A creates a task
    token_a = await _auth_token(client)
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/recipe"},
            headers=_auth(token_a),
        )
    task_id = r.json()["task_id"]

    # User B tries to access it
    token_b = await _auth_token(client)
    r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token_b))
    assert r.status_code == 404


async def test_get_import_task_returns_task_for_owner(client):
    token = await _auth_token(client)
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        post = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/recipe"},
            headers=_auth(token),
        )
    task_id = post.json()["task_id"]

    r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == task_id
    assert data["status"] == "pending"
    assert data["recipe_id"] is None
    assert data["error_message"] is None


# ── POST /api/v1/recipes/import/image ────────────────────────────────────────

async def test_import_image_requires_auth(client):
    r = await client.post(
        "/api/v1/recipes/import/image",
        files={"file": ("recipe.jpg", _MINIMAL_JPEG, "image/jpeg")},
    )
    assert r.status_code == 401


async def test_import_image_returns_202(client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.routes.import_tasks.settings.UPLOAD_DIR", str(tmp_path))
    token = await _auth_token(client)

    with patch("app.api.routes.import_tasks.process_image_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/image",
            files={"file": ("recipe.jpg", _MINIMAL_JPEG, "image/jpeg")},
            headers=_auth(token),
        )

    assert r.status_code == 202
    body = r.json()
    assert "task_id" in body
    assert body["status"] == "pending"


async def test_import_image_rejects_non_image(client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.routes.import_tasks.settings.UPLOAD_DIR", str(tmp_path))
    token = await _auth_token(client)

    r = await client.post(
        "/api/v1/recipes/import/image",
        files={"file": ("document.pdf", b"%PDF-1.4", "application/pdf")},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_import_image_task_has_image_type(client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.routes.import_tasks.settings.UPLOAD_DIR", str(tmp_path))
    token = await _auth_token(client)

    with patch("app.api.routes.import_tasks.process_image_import", AsyncMock()):
        post = await client.post(
            "/api/v1/recipes/import/image",
            files={"file": ("recipe.jpg", _MINIMAL_JPEG, "image/jpeg")},
            headers=_auth(token),
        )
    task_id = post.json()["task_id"]

    r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["import_type"] == "image"
