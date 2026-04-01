import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from app.main import app
from app.api.deps import get_db
from app.core import rate_limit as _rate_limit_module
from app.models import user as _user_models  # noqa: F401 — registers User table in SQLModel.metadata
from app.models import recipe as _recipe_models  # noqa: F401 — registers Recipe/RecipeVersion in SQLModel.metadata
from app.models import import_task as _import_task_models  # noqa: F401 — registers ImportTask in SQLModel.metadata

TEST_DATABASE_URL = "postgresql+asyncpg://mealtime:mealtime@localhost:5432/mealtime_test"


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


def unique_email(prefix: str = "test") -> str:
    """Generate a unique email per call to avoid DB uniqueness conflicts across tests."""
    return f"{prefix}+{uuid.uuid4().hex[:8]}@example.com"
