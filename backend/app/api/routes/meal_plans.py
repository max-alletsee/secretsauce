# backend/app/api/routes/meal_plans.py
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.user import User
from app.schemas.meal_plan import (
    MealPlanCreate,
    MealPlanEntryCreate,
    MealPlanEntryUpdate,
    MealPlanResponse,
    MealPlanWithEntries,
    MealPlanEntryResponse,
    ShortlistEntryCreate,
    ShortlistEntryResponse,
    ShortlistReorderRequest,
)
from app.services import meal_plan_service
from app.services import shortlist_service

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


@router.get("/shortlist", response_model=list[ShortlistEntryResponse])
async def get_shortlist(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[ShortlistEntryResponse]:
    entries = await shortlist_service.get_shortlist(db, user.id)
    return [ShortlistEntryResponse.model_validate(e) for e in entries]


@router.post("/shortlist", response_model=ShortlistEntryResponse, status_code=201)
async def add_to_shortlist(
    data: ShortlistEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ShortlistEntryResponse:
    entry = await shortlist_service.add_to_shortlist(db, user.id, data)
    return ShortlistEntryResponse.model_validate(entry)


@router.patch("/shortlist/reorder", response_model=list[ShortlistEntryResponse])
async def reorder_shortlist(
    data: ShortlistReorderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[ShortlistEntryResponse]:
    entries = await shortlist_service.reorder_shortlist(db, user.id, data.ordered_ids)
    return [ShortlistEntryResponse.model_validate(e) for e in entries]


@router.delete("/shortlist/{entry_id}", status_code=204)
async def remove_from_shortlist(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    await shortlist_service.remove_from_shortlist(db, user.id, entry_id)


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


@router.post("/{plan_id}/entries", response_model=MealPlanEntryResponse, status_code=201)
async def create_entry(
    plan_id: uuid.UUID,
    data: MealPlanEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanEntryResponse:
    entry = await meal_plan_service.add_entry(db, user.id, plan_id, data)
    return MealPlanEntryResponse.model_validate(entry)


@router.patch("/{plan_id}/entries/{entry_id}", response_model=MealPlanEntryResponse)
async def update_entry(
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
    data: MealPlanEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> MealPlanEntryResponse:
    entry = await meal_plan_service.update_entry(db, user.id, plan_id, entry_id, data)
    return MealPlanEntryResponse.model_validate(entry)


@router.delete("/{plan_id}/entries/{entry_id}", status_code=204)
async def delete_entry(
    plan_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    await meal_plan_service.delete_entry(db, user.id, plan_id, entry_id)
