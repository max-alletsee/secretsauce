# backend/app/api/routes/timeline.py
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.meal_plan import MealPlanEntry
from app.models.user import User
from app.schemas.timeline import (
    TimelineEntryCreate,
    TimelineEntryUpdate,
    TimelineEntryResponse,
    TimelineEntriesResponse,
)

router = APIRouter()


@router.get("/entries", response_model=TimelineEntriesResponse)
async def list_timeline_entries(
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> TimelineEntriesResponse:
    result = await db.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.user_id == user.id,
            MealPlanEntry.date >= from_date,
            MealPlanEntry.date <= to_date,
        ).order_by(MealPlanEntry.date, MealPlanEntry.position)
    )
    entries = list(result.scalars().all())
    return TimelineEntriesResponse(
        entries=[TimelineEntryResponse.model_validate(e) for e in entries]
    )


@router.post("/entries", response_model=TimelineEntryResponse, status_code=201)
async def create_timeline_entry(
    data: TimelineEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> TimelineEntryResponse:
    entry = MealPlanEntry(
        user_id=user.id,
        meal_plan_id=None,
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
    return TimelineEntryResponse.model_validate(entry)


@router.patch("/entries/{entry_id}", response_model=TimelineEntryResponse)
async def update_timeline_entry(
    entry_id: uuid.UUID,
    data: TimelineEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> TimelineEntryResponse:
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(entry, field, value)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TimelineEntryResponse.model_validate(entry)


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_timeline_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
