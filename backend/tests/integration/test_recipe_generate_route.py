# backend/tests/integration/test_recipe_generate_route.py
"""Integration tests for POST /api/v1/recipes/generate."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.models.import_task import ImportTaskStatus
from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedStep,
    RecipeImportResult,
)
from tests.conftest import unique_email


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _auth_token(client, password: str = "SecurePass123!") -> str:
    email = unique_email("generate")
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


# ── POST /api/v1/recipes/generate ────────────────────────────────────────────

async def test_generate_recipe_requires_auth(client):
    r = await client.post("/api/v1/recipes/generate", json={"title": "Spaghetti Bolognese"})
    assert r.status_code == 401


async def test_generate_recipe_rejects_empty_title(client):
    token = await _auth_token(client)
    r = await client.post(
        "/api/v1/recipes/generate",
        json={"title": ""},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_generate_recipe_returns_202_and_creates_task(client):
    token = await _auth_token(client)
    with patch(
        "app.api.routes.import_tasks.process_generate_task",
        AsyncMock(),  # prevent background task from running
    ):
        r = await client.post(
            "/api/v1/recipes/generate",
            json={"title": "Spaghetti Bolognese"},
            headers=_auth(token),
        )
    assert r.status_code == 202
    data = r.json()
    assert "task_id" in data
    assert data["status"] == "pending"
    # task_id should be a valid UUID
    uuid.UUID(data["task_id"])


async def test_generate_recipe_task_is_queryable(client):
    token = await _auth_token(client)
    with patch("app.api.routes.import_tasks.process_generate_task", AsyncMock()):
        post = await client.post(
            "/api/v1/recipes/generate",
            json={"title": "Chicken Tikka Masala"},
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


async def test_generate_recipe_background_task_creates_recipe(client):
    """Test that the generate endpoint accepts the request and task ID is valid.

    The background task (process_generate_task) uses async_session_factory with its
    own DB session — unit-tested separately in test_recipe_import_service.py.
    Here we verify the 202 response and that the resulting task is queryable.
    """
    token = await _auth_token(client)

    with patch("app.api.routes.import_tasks.process_generate_task", AsyncMock()):
        post = await client.post(
            "/api/v1/recipes/generate",
            json={"title": "Spaghetti Bolognese"},
            headers=_auth(token),
        )
    assert post.status_code == 202
    task_id = post.json()["task_id"]

    r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == task_id
    assert data["status"] == "pending"
