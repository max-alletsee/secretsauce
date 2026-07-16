# backend/app/services/ai_budget.py
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AICallLog
from app.models.user import User

ONBOARDING_MODE_MESSAGE = (
    "Onboarding mode — AI features are temporarily limited. "
    "Contact the administrator to continue."
)


async def count_ai_calls(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Total AI calls ever logged for this user. Failed calls count too —
    retries and malformed responses still consume API spend."""
    result = await db.execute(
        select(func.count()).select_from(AICallLog).where(AICallLog.user_id == user_id)
    )
    return result.scalar_one()


async def ensure_ai_budget(db: AsyncSession, user: User) -> None:
    """Raise 403 when a budgeted user has used up their AI call allowance.

    ai_call_budget is None for unlimited (grandfathered / admin-lifted) users.
    """
    if user.ai_call_budget is None:
        return
    used = await count_ai_calls(db, user.id)
    if used >= user.ai_call_budget:
        raise HTTPException(status_code=403, detail=ONBOARDING_MODE_MESSAGE)
