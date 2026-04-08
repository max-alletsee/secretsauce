# backend/app/services/shortlist_service.py
import uuid

from fastapi import HTTPException
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal_plan import ShortlistEntry
from app.schemas.meal_plan import ShortlistEntryCreate


async def get_shortlist(db: AsyncSession, user_id: uuid.UUID) -> list[ShortlistEntry]:
    result = await db.execute(
        select(ShortlistEntry)
        .where(ShortlistEntry.user_id == user_id)
        .order_by(ShortlistEntry.position.asc(), ShortlistEntry.created_at.asc())
    )
    return list(result.scalars().all())


async def add_to_shortlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: ShortlistEntryCreate,
) -> ShortlistEntry:
    # Assign position = max existing + 1
    existing = await get_shortlist(db, user_id)
    next_position = max((e.position for e in existing), default=-1) + 1
    entry = ShortlistEntry(
        user_id=user_id,
        recipe_id=data.recipe_id,
        note=data.note,
        entry_type=data.entry_type,
        position=next_position,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def remove_from_shortlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> None:
    entry = await db.get(ShortlistEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="Shortlist entry not found")
    await db.delete(entry)
    await db.commit()


async def reorder_shortlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    ordered_ids: list[uuid.UUID],
) -> list[ShortlistEntry]:
    for position, entry_id in enumerate(ordered_ids):
        await db.execute(
            sa_update(ShortlistEntry)
            .where(ShortlistEntry.id == entry_id, ShortlistEntry.user_id == user_id)
            .values(position=position)
            .execution_options(synchronize_session=False)
        )
    await db.commit()
    return await get_shortlist(db, user_id)
