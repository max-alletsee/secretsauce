# backend/tests/unit/test_ai_budget_service.py
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.admin import AICallLog
from app.models.user import User
from app.services import ai_budget
from tests.conftest import unique_email


# ── Model default ─────────────────────────────────────────────────────────────

def test_new_user_gets_default_ai_call_budget():
    user = User(email=unique_email(), hashed_password="x")
    assert user.ai_call_budget == 300


def test_ai_call_budget_can_be_set_to_none():
    user = User(email=unique_email(), hashed_password="x", ai_call_budget=None)
    assert user.ai_call_budget is None


@pytest.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


async def _make_user(db: AsyncSession, *, budget: int | None) -> User:
    user = User(email=unique_email("aibudget"), hashed_password="x", ai_call_budget=budget)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _make_log(user_id: uuid.UUID, *, success: bool = True) -> AICallLog:
    return AICallLog(
        user_id=user_id,
        call_type="url_import",
        model="test-model",
        prompt_summary="prompt",
        latency_ms=10,
        input_tokens=5,
        output_tokens=5,
        success=success,
        error_message=None if success else "boom",
        created_at=datetime.now(timezone.utc),
    )


async def _add_logs(db: AsyncSession, user_id: uuid.UUID, n: int, *, success: bool = True) -> None:
    for _ in range(n):
        db.add(_make_log(user_id, success=success))
    await db.commit()


# ── count_ai_calls ────────────────────────────────────────────────────────────

async def test_count_ai_calls_zero_without_logs(db_session):
    user = await _make_user(db_session, budget=300)
    assert await ai_budget.count_ai_calls(db_session, user.id) == 0


async def test_count_ai_calls_includes_failed_calls(db_session):
    user = await _make_user(db_session, budget=300)
    await _add_logs(db_session, user.id, 2, success=True)
    await _add_logs(db_session, user.id, 1, success=False)
    assert await ai_budget.count_ai_calls(db_session, user.id) == 3


async def test_count_ai_calls_only_counts_own_calls(db_session):
    user = await _make_user(db_session, budget=300)
    other = await _make_user(db_session, budget=300)
    await _add_logs(db_session, other.id, 5)
    assert await ai_budget.count_ai_calls(db_session, user.id) == 0


# ── ensure_ai_budget ──────────────────────────────────────────────────────────

async def test_ensure_ai_budget_unlimited_always_passes(db_session):
    user = await _make_user(db_session, budget=None)
    await _add_logs(db_session, user.id, 10)
    await ai_budget.ensure_ai_budget(db_session, user)  # must not raise


async def test_ensure_ai_budget_under_budget_passes(db_session):
    user = await _make_user(db_session, budget=3)
    await _add_logs(db_session, user.id, 2)
    await ai_budget.ensure_ai_budget(db_session, user)  # must not raise


async def test_ensure_ai_budget_at_budget_raises_403(db_session):
    user = await _make_user(db_session, budget=2)
    await _add_logs(db_session, user.id, 2)
    with pytest.raises(HTTPException) as exc_info:
        await ai_budget.ensure_ai_budget(db_session, user)
    assert exc_info.value.status_code == 403
    assert "Onboarding mode" in exc_info.value.detail


async def test_ensure_ai_budget_over_budget_raises_403(db_session):
    user = await _make_user(db_session, budget=1)
    await _add_logs(db_session, user.id, 5)
    with pytest.raises(HTTPException):
        await ai_budget.ensure_ai_budget(db_session, user)


async def test_ensure_ai_budget_zero_budget_blocks_immediately(db_session):
    user = await _make_user(db_session, budget=0)
    with pytest.raises(HTTPException):
        await ai_budget.ensure_ai_budget(db_session, user)
