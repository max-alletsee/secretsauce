# backend/tests/unit/test_admin_service.py
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminAuditLog
from app.models.user import User
from app.services import admin as admin_service
from tests.conftest import unique_email


async def _make_user(db: AsyncSession, *, is_superuser: bool = False, is_active: bool = True) -> User:
    u = User(
        email=unique_email(),
        hashed_password="x",
        is_superuser=is_superuser,
        is_active=is_active,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest.fixture
async def db_session(db_engine):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


async def test_list_users_returns_all(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session)
    items, cursor, has_more = await admin_service.list_users(db_session)
    emails = [u.email for u in items]
    assert user.email in emails
    assert admin.email in emails
    assert has_more is False
    assert cursor is None


async def test_list_users_search_by_email(db_session):
    u = await _make_user(db_session)
    items, _, _ = await admin_service.list_users(db_session, search=u.email[:10])
    assert any(x.email == u.email for x in items)


async def test_list_users_status_filter(db_session):
    inactive = await _make_user(db_session, is_active=False)
    items, _, _ = await admin_service.list_users(db_session, status="inactive")
    assert all(not u.is_active for u in items)
    assert any(u.email == inactive.email for u in items)


async def test_list_users_cursor_pagination(db_session):
    # Create 3 users and paginate with limit=2
    for _ in range(3):
        await _make_user(db_session)
    page1, cursor, has_more = await admin_service.list_users(db_session, limit=2)
    assert len(page1) == 2
    assert has_more is True
    assert cursor is not None
    page2, cursor2, _ = await admin_service.list_users(db_session, cursor=cursor, limit=2)
    assert len(page2) >= 1
    ids_page1 = {u.id for u in page1}
    ids_page2 = {u.id for u in page2}
    assert ids_page1.isdisjoint(ids_page2)


async def test_get_user_stats_zero(db_session):
    user = await _make_user(db_session)
    stats = await admin_service.get_user_stats(db_session, user.id)
    assert stats.recipe_count == 0
    assert stats.meal_plan_count == 0
    assert stats.last_active is None


async def test_update_user_deactivate_writes_audit(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session, is_active=True)
    updated = await admin_service.update_user(db_session, user.id, admin, is_active=False)
    assert updated is not None
    assert updated.is_active is False
    from sqlalchemy import select
    result = await db_session.execute(
        select(AdminAuditLog).where(
            AdminAuditLog.admin_id == admin.id,
            AdminAuditLog.action == "DEACTIVATE",
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.details["email"] == user.email


async def test_update_user_promote_writes_audit(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session)
    updated = await admin_service.update_user(db_session, user.id, admin, is_superuser=True)
    assert updated.is_superuser is True
    from sqlalchemy import select
    result = await db_session.execute(
        select(AdminAuditLog).where(
            AdminAuditLog.admin_id == admin.id,
            AdminAuditLog.action == "PROMOTE",
        )
    )
    assert result.scalars().first() is not None


async def test_update_user_no_change_no_audit(db_session):
    from sqlalchemy import select
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session, is_active=True)
    before_count_result = await db_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.admin_id == admin.id)
    )
    before_count = len(before_count_result.scalars().all())
    await admin_service.update_user(db_session, user.id, admin, is_active=True)  # no change
    after_count_result = await db_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.admin_id == admin.id)
    )
    assert len(after_count_result.scalars().all()) == before_count


async def test_delete_user_removes_user_and_writes_audit(db_session):
    from sqlalchemy import select
    admin = await _make_user(db_session, is_superuser=True)
    user = await _make_user(db_session)
    user_email = user.email
    deleted = await admin_service.delete_user(db_session, user.id, admin)
    assert deleted is True
    assert await db_session.get(User, user.id) is None
    result = await db_session.execute(
        select(AdminAuditLog).where(
            AdminAuditLog.admin_id == admin.id,
            AdminAuditLog.action == "DELETE",
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.details["email"] == user_email


async def test_delete_user_not_found_returns_false(db_session):
    admin = await _make_user(db_session, is_superuser=True)
    result = await admin_service.delete_user(db_session, uuid.uuid4(), admin)
    assert result is False
