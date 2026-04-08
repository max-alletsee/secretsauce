# backend/app/services/meal_plan_service.py
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal_plan import MealPlan, MealPlanEntry
from app.schemas.meal_plan import (
    MealPlanCreate,
    MealPlanEntryCreate,
    MealPlanEntryUpdate,
)


async def create_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: MealPlanCreate,
) -> MealPlan:
    plan = MealPlan(
        user_id=user_id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def get_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> MealPlan:
    plan = await db.get(MealPlan, plan_id)
    if plan is None or plan.user_id != user_id:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    return plan


async def list_meal_plans(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[MealPlan]:
    result = await db.execute(
        select(MealPlan)
        .where(MealPlan.user_id == user_id)
        .order_by(MealPlan.created_at.desc())
    )
    return list(result.scalars().all())


async def confirm_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> MealPlan:
    plan = await get_meal_plan(db, user_id, plan_id)
    if plan.status != "draft":
        raise HTTPException(
            status_code=400,
            detail="Meal plan cannot be confirmed — it is not in draft status",
        )
    plan.status = "active"
    plan.updated_at = datetime.now(timezone.utc)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def get_entries(
    db: AsyncSession,
    plan_id: uuid.UUID,
) -> list[MealPlanEntry]:
    result = await db.execute(
        select(MealPlanEntry)
        .where(MealPlanEntry.meal_plan_id == plan_id)
        .order_by(MealPlanEntry.date, MealPlanEntry.position)
    )
    return list(result.scalars().all())
