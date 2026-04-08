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


async def add_entry(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    data: MealPlanEntryCreate,
) -> MealPlanEntry:
    await get_meal_plan(db, user_id, plan_id)  # ownership check raises 404 if not found
    entry = MealPlanEntry(
        meal_plan_id=plan_id,
        date=data.date,
        meal_type=data.meal_type,
        recipe_id=data.recipe_id,
        note=data.note,
        entry_type=data.entry_type,
        servings=data.servings,
        source=data.source,
        position=data.position,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def update_entry(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
    data: MealPlanEntryUpdate,
) -> MealPlanEntry:
    await get_meal_plan(db, user_id, plan_id)  # ownership check
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.meal_plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    if data.recipe_id is not None:
        entry.recipe_id = data.recipe_id
    if data.note is not None:
        entry.note = data.note
    if data.entry_type is not None:
        entry.entry_type = data.entry_type
    if data.servings is not None:
        entry.servings = data.servings
    if data.position is not None:
        entry.position = data.position
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def delete_entry(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> None:
    await get_meal_plan(db, user_id, plan_id)  # ownership check
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.meal_plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
