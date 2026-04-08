# backend/app/services/meal_log_service.py
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal_plan import CarryoverMeal, MealPlan, MealPlanEntry, RecipeCookLog
from app.schemas.meal_plan import LogEntry


async def log_meal_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    entries: list[LogEntry],
) -> list[CarryoverMeal]:
    plan = await db.get(MealPlan, plan_id)
    if plan is None or plan.user_id != user_id:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    if plan.status != "active":
        raise HTTPException(
            status_code=400,
            detail="Meal plan cannot be logged — it is not active",
        )

    carryovers: list[CarryoverMeal] = []

    for log_entry in entries:
        db_entry = await db.get(MealPlanEntry, log_entry.entry_id)
        if db_entry is None or db_entry.meal_plan_id != plan_id:
            continue  # skip invalid entry IDs
        if db_entry.recipe_id is None:
            continue  # skip free-text / suggestion entries

        if log_entry.outcome == "cooked":
            cook_log = RecipeCookLog(
                user_id=user_id,
                recipe_id=db_entry.recipe_id,
                meal_plan_id=plan_id,
                cooked_at=db_entry.date,
            )
            db.add(cook_log)

        elif log_entry.outcome in ("not_cooked", "leftover"):
            carryover = CarryoverMeal(
                user_id=user_id,
                source_meal_plan_id=plan_id,
                recipe_id=db_entry.recipe_id,
                original_date=db_entry.date,
                original_meal_type=db_entry.meal_type,
                reason=log_entry.outcome,
            )
            db.add(carryover)
            carryovers.append(carryover)

    plan.status = "completed"
    plan.updated_at = datetime.now(timezone.utc)
    db.add(plan)
    await db.commit()

    for c in carryovers:
        await db.refresh(c)

    return carryovers


async def get_unresolved_carryovers(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[CarryoverMeal]:
    result = await db.execute(
        select(CarryoverMeal)
        .where(CarryoverMeal.user_id == user_id, CarryoverMeal.resolved == False)  # noqa: E712
        .order_by(CarryoverMeal.created_at.desc())
    )
    return list(result.scalars().all())
