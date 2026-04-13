# backend/app/api/routes/admin.py
import asyncio
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.core.security import current_superuser
from app.models.user import User
from app.schemas.admin import (
    AdminUserResponse,
    AdminUserUpdate,
    AICallLogResponse,
    AppLogsResponse,
    PaginatedAdminUsersResponse,
    PaginatedAICallLogResponse,
    PaginatedAuditLogResponse,
    UserStatsResponse,
)
from app.services import admin as admin_service
from app.tasks.cleanup import cleanup_old_uploads

router = APIRouter()


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=PaginatedAdminUsersResponse)
async def list_users(
    search: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None),
    role: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> PaginatedAdminUsersResponse:
    items, next_cursor, has_more = await admin_service.list_users(
        db, search=search, status=status, role=role, cursor=cursor, limit=limit
    )
    return PaginatedAdminUsersResponse(
        items=[AdminUserResponse.model_validate(u) for u in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> AdminUserResponse:
    user = await admin_service.update_user(
        db, user_id, admin,
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return AdminUserResponse.model_validate(user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> None:
    if not await admin_service.delete_user(db, user_id, admin):
        raise HTTPException(status_code=404, detail="User not found")


@router.get("/users/{user_id}/stats", response_model=UserStatsResponse)
async def get_user_stats(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> UserStatsResponse:
    if not await db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return await admin_service.get_user_stats(db, user_id)


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs/app", response_model=AppLogsResponse)
async def get_app_logs(
    level: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    admin: User = Depends(current_superuser),
) -> AppLogsResponse:
    items = await admin_service.get_app_logs(
        level=level, user_id=user_id, limit=limit, log_file=settings.APP_LOG_FILE
    )
    return AppLogsResponse(items=items)


@router.get("/logs/ai", response_model=PaginatedAICallLogResponse)
async def get_ai_logs(
    call_type: str | None = Query(default=None),
    success: bool | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    since: datetime | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> PaginatedAICallLogResponse:
    items, next_cursor, has_more = await admin_service.get_ai_logs(
        db, call_type=call_type, success=success, user_id=user_id,
        since=since, cursor=cursor, limit=limit,
    )
    return PaginatedAICallLogResponse(
        items=[AICallLogResponse.model_validate(i) for i in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/logs/audit", response_model=PaginatedAuditLogResponse)
async def get_audit_logs(
    action: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> PaginatedAuditLogResponse:
    items, next_cursor, has_more = await admin_service.get_audit_logs(
        db, action=action, since=since, cursor=cursor, limit=limit,
    )
    return PaginatedAuditLogResponse(items=items, next_cursor=next_cursor, has_more=has_more)


# ── Cleanup ───────────────────────────────────────────────────────────────────

@router.post("/cleanup")
async def trigger_cleanup(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(current_superuser),
) -> dict:
    deleted_count = await asyncio.to_thread(cleanup_old_uploads)
    await admin_service.write_audit_log(
        db, admin_id=admin.id, action="CLEANUP",
        details={"deleted_count": deleted_count},
    )
    await db.commit()
    return {"deleted_count": deleted_count}
