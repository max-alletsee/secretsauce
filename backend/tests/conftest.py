import json
import os
import pathlib
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from app.main import app
from app.api.deps import get_db
from app.core import rate_limit as _rate_limit_module
from app.models import user as _user_models  # noqa: F401 — registers User table in SQLModel.metadata
from app.models import recipe as _recipe_models  # noqa: F401 — registers Recipe/RecipeVersion in SQLModel.metadata
from app.models import import_task as _import_task_models  # noqa: F401 — registers ImportTask in SQLModel.metadata
from app.models import meal_plan as _meal_plan_models  # noqa: F401 — registers meal plan tables in SQLModel.metadata
from app.models import shopping_list as _shopping_list_models  # noqa: F401 — registers ShoppingList/ShoppingListItem in SQLModel.metadata
from app.models import admin as _admin_models  # noqa: F401 — registers AICallLog/AdminAuditLog in SQLModel.metadata

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://mealtime:mealtime@localhost:5432/mealtime_test",
)


@pytest.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session")
async def client(db_engine):
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clear_rate_limit_state():
    """Reset in-memory rate-limit counters before every test to prevent test bleed-through."""
    _rate_limit_module._auth_attempts.clear()
    _rate_limit_module._import_attempts.clear()


def unique_email(prefix: str = "test") -> str:
    """Generate a unique email per call to avoid DB uniqueness conflicts across tests."""
    return f"{prefix}+{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture
async def superuser_token(client, db_engine) -> str:
    """Create a user, promote to superuser via DB, return access token."""
    from app.models.user import User as UserModel

    email = unique_email("superuser")
    password = "SuperPass123!"

    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.json()
    user_id = reg.json()["id"]

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        await session.execute(
            update(UserModel)
            .where(UserModel.id == uuid.UUID(user_id))
            .values(is_superuser=True)
        )
        await session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return login.json()["access_token"]


_FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> list[dict]:
    """Load and return raw dicts from a JSON fixture file.

    Usage:
        users = load_fixture("users")  # returns list[dict]
    """
    return json.loads((_FIXTURES_DIR / f"{name}.json").read_text())


@pytest.fixture
async def seeded_user(client) -> dict:
    """Register the first fixture user and return {email, password, token}."""
    user_data = load_fixture("users")[0]
    password = user_data["password"]

    reg = await client.post("/api/v1/auth/register", json={"email": unique_email("seed"), "password": password})
    assert reg.status_code == 201, reg.json()
    actual_email = reg.json()["email"]

    login = await client.post(
        "/api/v1/auth/login",
        data={"username": actual_email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return {"email": actual_email, "password": password, "token": login.json()["access_token"]}
