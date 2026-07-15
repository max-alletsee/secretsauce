# backend/tests/integration/test_ai_budget_routes.py
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.admin import AICallLog
from app.models.user import User
from tests.conftest import unique_email


async def _register_and_login(client) -> dict:
    """Register a fresh user, return {"id", "email", "token"}."""
    email = unique_email("budget")
    r = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "Pass123!"}
    )
    assert r.status_code == 201, r.json()
    user_id = r.json()["id"]
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "Pass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return {"id": user_id, "email": email, "token": login.json()["access_token"]}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Registration default ─────────────────────────────────────────────────────

async def test_registration_assigns_default_budget(client, db_engine):
    creds = await _register_and_login(client)

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        user = await session.get(User, uuid.UUID(creds["id"]))
        assert user is not None
        assert user.ai_call_budget == 300


_FAKE_ID = "00000000-0000-0000-0000-000000000000"


async def _set_budget(db_engine, user_id: uuid.UUID, budget: int | None) -> None:
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        await session.execute(
            update(User).where(User.id == user_id).values(ai_call_budget=budget)
        )
        await session.commit()


async def _add_call_log(db_engine, user_id: uuid.UUID) -> None:
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add(AICallLog(
            user_id=user_id, call_type="url_import", model="test-model",
            prompt_summary="p", latency_ms=1, input_tokens=1, output_tokens=1,
            success=True, error_message=None,
            created_at=datetime.now(timezone.utc),
        ))
        await session.commit()


# ── Route guards ──────────────────────────────────────────────────────────────

async def test_exhausted_user_blocked_on_all_json_ai_routes(client, db_engine):
    creds = await _register_and_login(client)
    await _set_budget(db_engine, uuid.UUID(creds["id"]), 0)
    headers = _auth(creds["token"])

    requests = [
        ("POST /recipes/import/url",
         client.post("/api/v1/recipes/import/url",
                     json={"url": "https://example.com/r"}, headers=headers)),
        ("POST /recipes/generate",
         client.post("/api/v1/recipes/generate",
                     json={"title": "Pasta"}, headers=headers)),
        ("POST /meal-plans/suggestions",
         client.post("/api/v1/meal-plans/suggestions", json={}, headers=headers)),
        ("POST /shopping-lists/generate",
         client.post("/api/v1/shopping-lists/generate",
                     json={"entry_ids": [_FAKE_ID], "name": "L"}, headers=headers)),
        ("POST /shopping-lists/{id}/regenerate",
         client.post(f"/api/v1/shopping-lists/{_FAKE_ID}/regenerate", headers=headers)),
    ]
    for label, coro in requests:
        r = await coro
        assert r.status_code == 403, (label, r.status_code, r.text)
        assert "Onboarding mode" in r.json()["detail"], label


async def test_exhausted_user_blocked_on_image_import(client, db_engine):
    creds = await _register_and_login(client)
    await _set_budget(db_engine, uuid.UUID(creds["id"]), 0)
    r = await client.post(
        "/api/v1/recipes/import/image",
        files={"file": ("r.jpg", b"fakebytes", "image/jpeg")},
        headers=_auth(creds["token"]),
    )
    assert r.status_code == 403
    assert "Onboarding mode" in r.json()["detail"]


async def test_user_with_remaining_budget_can_start_import(client, db_engine):
    creds = await _register_and_login(client)  # default budget 300, 0 used
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/r"},
            headers=_auth(creds["token"]),
        )
    assert r.status_code == 202, r.text


async def test_budget_boundary_last_call_blocks(client, db_engine):
    creds = await _register_and_login(client)
    uid = uuid.UUID(creds["id"])
    await _set_budget(db_engine, uid, 1)
    await _add_call_log(db_engine, uid)  # used == budget
    r = await client.post(
        "/api/v1/recipes/import/url",
        json={"url": "https://example.com/r"},
        headers=_auth(creds["token"]),
    )
    assert r.status_code == 403


async def test_unlimited_user_never_blocked(client, db_engine):
    creds = await _register_and_login(client)
    uid = uuid.UUID(creds["id"])
    await _set_budget(db_engine, uid, None)
    await _add_call_log(db_engine, uid)
    with patch("app.api.routes.import_tasks.process_url_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/url",
            json={"url": "https://example.com/r"},
            headers=_auth(creds["token"]),
        )
    assert r.status_code == 202, r.text
