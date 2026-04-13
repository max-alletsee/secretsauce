# backend/app/services/admin.py
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminAuditLog, AICallLog
from app.models.meal_plan import MealPlan
from app.models.recipe import Recipe
from app.models.user import User
from app.schemas.admin import (
    AdminAuditLogResponse,
    AppLogEntry,
    UserStatsResponse,
)


# ── User management ──────────────────────────────────────────────────────────

async def list_users(
    db: AsyncSession,
    *,
    search: str | None = None,
    status: str | None = None,
    role: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[User], str | None, bool]:
    """Return (items, next_cursor, has_more). cursor = '{iso}|{id}'."""
    stmt = select(User).order_by(User.created_at.desc(), User.id.desc())

    if search:
        term = f"%{search.lower()}%"
        stmt = stmt.where(
            (func.lower(User.email).like(term)) | (func.lower(User.display_name).like(term))
        )
    if status == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif status == "inactive":
        stmt = stmt.where(User.is_active.is_(False))
    if role == "superuser":
        stmt = stmt.where(User.is_superuser.is_(True))
    elif role == "user":
        stmt = stmt.where(User.is_superuser.is_(False))

    if cursor:
        ts_str, id_str = cursor.split("|", 1)
        cursor_time = datetime.fromisoformat(ts_str)
        cursor_id = uuid.UUID(id_str)
        stmt = stmt.where(
            (User.created_at < cursor_time)
            | ((User.created_at == cursor_time) & (User.id < cursor_id))
        )

    result = await db.execute(stmt.limit(limit + 1))
    rows = list(result.scalars())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more:
        last = items[-1]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
    return items, next_cursor, has_more


async def get_user_stats(db: AsyncSession, user_id: uuid.UUID) -> UserStatsResponse:
    recipe_count = (
        await db.execute(select(func.count()).select_from(Recipe).where(Recipe.owner_id == user_id))
    ).scalar_one()
    meal_count = (
        await db.execute(select(func.count()).select_from(MealPlan).where(MealPlan.user_id == user_id))
    ).scalar_one()

    recipe_max = (
        await db.execute(select(func.max(Recipe.created_at)).where(Recipe.owner_id == user_id))
    ).scalar_one_or_none()
    meal_max = (
        await db.execute(select(func.max(MealPlan.created_at)).where(MealPlan.user_id == user_id))
    ).scalar_one_or_none()

    candidates = [t for t in [recipe_max, meal_max] if t is not None]
    return UserStatsResponse(
        recipe_count=recipe_count,
        meal_plan_count=meal_count,
        last_active=max(candidates) if candidates else None,
    )


async def update_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    admin: User,
    *,
    is_active: bool | None = None,
    is_superuser: bool | None = None,
) -> User | None:
    user = await db.get(User, user_id)
    if user is None:
        return None
    changed = False
    if is_active is not None and is_active != user.is_active:
        user.is_active = is_active
        await write_audit_log(
            db, admin_id=admin.id,
            action="ACTIVATE" if is_active else "DEACTIVATE",
            target_user_id=user_id, details={"email": user.email},
        )
        changed = True
    if is_superuser is not None and is_superuser != user.is_superuser:
        user.is_superuser = is_superuser
        await write_audit_log(
            db, admin_id=admin.id,
            action="PROMOTE" if is_superuser else "DEMOTE",
            target_user_id=user_id, details={"email": user.email},
        )
        changed = True
    if changed:
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: uuid.UUID, admin: User) -> bool:
    user = await db.get(User, user_id)
    if user is None:
        return False
    details = {"email": user.email, "deleted_user_id": str(user_id)}
    # target_user_id=None to avoid FK constraint when the user row is deleted
    await write_audit_log(db, admin_id=admin.id, action="DELETE", target_user_id=None, details=details)
    await db.delete(user)
    await db.commit()
    return True


async def write_audit_log(
    db: AsyncSession,
    *,
    admin_id: uuid.UUID,
    action: str,
    target_user_id: uuid.UUID | None = None,
    details: dict[str, Any],
) -> None:
    """Add an audit log entry to the session. Caller is responsible for committing."""
    db.add(AdminAuditLog(
        admin_id=admin_id,
        action=action,
        target_user_id=target_user_id,
        details=details,
        created_at=datetime.now(timezone.utc),
    ))


# ── Log queries ───────────────────────────────────────────────────────────────

async def get_app_logs(
    *,
    level: str | None = None,
    user_id: str | None = None,
    limit: int = 100,
    log_file: str,
) -> list[AppLogEntry]:
    import json as _json

    path = Path(log_file)
    if not path.exists():
        return []
    matching: deque[AppLogEntry] = deque(maxlen=limit)
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = _json.loads(line)
                if level and data.get("level") != level:
                    continue
                if user_id and data.get("user_id") != user_id:
                    continue
                matching.append(AppLogEntry(**{k: data.get(k) for k in AppLogEntry.model_fields}))
            except Exception:
                continue
    return list(matching)


async def get_ai_logs(
    db: AsyncSession,
    *,
    call_type: str | None = None,
    success: bool | None = None,
    user_id: uuid.UUID | None = None,
    since: datetime | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[AICallLog], str | None, bool]:
    stmt = select(AICallLog).order_by(AICallLog.created_at.desc(), AICallLog.id.desc())
    if call_type:
        stmt = stmt.where(AICallLog.call_type == call_type)
    if success is not None:
        stmt = stmt.where(AICallLog.success.is_(success))
    if user_id:
        stmt = stmt.where(AICallLog.user_id == user_id)
    if since:
        stmt = stmt.where(AICallLog.created_at >= since)
    if cursor:
        ts_str, id_str = cursor.split("|", 1)
        cursor_time = datetime.fromisoformat(ts_str)
        cursor_id = uuid.UUID(id_str)
        stmt = stmt.where(
            (AICallLog.created_at < cursor_time)
            | ((AICallLog.created_at == cursor_time) & (AICallLog.id < cursor_id))
        )
    result = await db.execute(stmt.limit(limit + 1))
    rows = list(result.scalars())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more:
        last = items[-1]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
    return items, next_cursor, has_more


async def get_audit_logs(
    db: AsyncSession,
    *,
    action: str | None = None,
    since: datetime | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[AdminAuditLogResponse], str | None, bool]:
    from sqlalchemy.orm import aliased

    AdminUser = aliased(User)
    TargetUser = aliased(User)

    stmt = (
        select(
            AdminAuditLog,
            AdminUser.email.label("admin_email"),
            TargetUser.email.label("target_email"),
        )
        .join(AdminUser, AdminAuditLog.admin_id == AdminUser.id)
        .outerjoin(TargetUser, AdminAuditLog.target_user_id == TargetUser.id)
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
    )
    if action:
        stmt = stmt.where(AdminAuditLog.action == action)
    if since:
        stmt = stmt.where(AdminAuditLog.created_at >= since)
    if cursor:
        ts_str, id_str = cursor.split("|", 1)
        cursor_time = datetime.fromisoformat(ts_str)
        cursor_id = uuid.UUID(id_str)
        stmt = stmt.where(
            (AdminAuditLog.created_at < cursor_time)
            | ((AdminAuditLog.created_at == cursor_time) & (AdminAuditLog.id < cursor_id))
        )
    result = await db.execute(stmt.limit(limit + 1))
    rows = result.all()
    has_more = len(rows) > limit
    raw = rows[:limit]
    next_cursor: str | None = None
    if has_more:
        last_log = raw[-1][0]
        next_cursor = f"{last_log.created_at.isoformat()}|{last_log.id}"

    items = [
        AdminAuditLogResponse(
            id=log.id,
            admin_id=log.admin_id,
            admin_email=admin_email,
            action=log.action,
            target_user_id=log.target_user_id,
            target_email=target_email,
            details=log.details,
            description=_format_audit_description(log.action, target_email, log.details),
            created_at=log.created_at,
        )
        for log, admin_email, target_email in raw
    ]
    return items, next_cursor, has_more


def _format_audit_description(action: str, target_email: str | None, details: dict) -> str:
    email = target_email or details.get("email", "unknown")
    match action:
        case "PROMOTE":    return f"Promoted {email} to superuser"
        case "DEMOTE":     return f"Demoted {email} from superuser"
        case "ACTIVATE":   return f"Activated {email}"
        case "DEACTIVATE": return f"Deactivated {email}"
        case "DELETE":     return f"Deleted user {details.get('email', 'unknown')}"
        case "CLEANUP":    return f"Ran cleanup — {details.get('deleted_count', 0)} files deleted"
        case _:            return f"{action}: {email}"
