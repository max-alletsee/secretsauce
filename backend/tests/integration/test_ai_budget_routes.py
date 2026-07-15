# backend/tests/integration/test_ai_budget_routes.py
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

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
