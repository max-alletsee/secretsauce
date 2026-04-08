# backend/app/api/routes/meal_plans.py
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.user import User
from app.schemas.meal_plan import (
    MealPlanCreate,
    MealPlanResponse,
    MealPlanWithEntries,
    MealPlanEntryResponse,
)
from app.services import meal_plan_service

router = APIRouter()


@router.post("", response_model=MealPlanResponse, status_code=201)
async def create_meal_plan(
    data: MealPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanResponse:
    plan = await meal_plan_service.create_meal_plan(db, user.id, data)
    return MealPlanResponse.model_validate(plan)


@router.get("", response_model=list[MealPlanResponse])
async def list_meal_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[MealPlanResponse]:
    plans = await meal_plan_service.list_meal_plans(db, user.id)
    return [MealPlanResponse.model_validate(p) for p in plans]


@router.get("/{plan_id}", response_model=MealPlanWithEntries)
async def get_meal_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanWithEntries:
    plan = await meal_plan_service.get_meal_plan(db, user.id, plan_id)
    entries = await meal_plan_service.get_entries(db, plan_id)
    return MealPlanWithEntries(
        **MealPlanResponse.model_validate(plan).model_dump(),
        entries=[MealPlanEntryResponse.model_validate(e) for e in entries],
    )


@router.post("/{plan_id}/confirm", response_model=MealPlanResponse)
async def confirm_meal_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanResponse:
    plan = await meal_plan_service.confirm_meal_plan(db, user.id, plan_id)
    return MealPlanResponse.model_validate(plan)
