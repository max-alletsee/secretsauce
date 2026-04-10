# backend/app/api/routes/shopping_lists.py
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.shopping_list import ShoppingList, ShoppingListItem
from app.models.user import User
from app.schemas.shopping_list import (
    ShoppingListItemResponse,
    ShoppingListItemUpdate,
    ShoppingListResponse,
)
from app.services import shopping as shopping_service

router = APIRouter()


async def _load_items(db: AsyncSession, list_id: uuid.UUID) -> list[ShoppingListItem]:
    result = await db.execute(
        select(ShoppingListItem).where(ShoppingListItem.shopping_list_id == list_id)
    )
    return list(result.scalars().all())


def _to_response(shopping_list: ShoppingList, items: list[ShoppingListItem]) -> ShoppingListResponse:
    return ShoppingListResponse(
        id=shopping_list.id,
        user_id=shopping_list.user_id,
        meal_plan_id=shopping_list.meal_plan_id,
        name=shopping_list.name,
        items=[ShoppingListItemResponse.model_validate(item) for item in items],
        created_at=shopping_list.created_at,
        updated_at=shopping_list.updated_at,
    )


@router.get("/{meal_plan_id}", response_model=ShoppingListResponse)
async def get_shopping_list(
    meal_plan_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    shopping_list = await shopping_service.get_or_create_shopping_list(db, user.id, meal_plan_id)
    items = await _load_items(db, shopping_list.id)
    return _to_response(shopping_list, items)


@router.post("/{meal_plan_id}/regenerate", response_model=ShoppingListResponse)
async def regenerate_shopping_list(
    meal_plan_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    shopping_list = await shopping_service.regenerate_shopping_list(db, user.id, meal_plan_id)
    items = await _load_items(db, shopping_list.id)
    return _to_response(shopping_list, items)


@router.patch("/{meal_plan_id}/items/{item_id}", response_model=ShoppingListItemResponse)
async def toggle_item(
    meal_plan_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ShoppingListItemUpdate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    item = await shopping_service.toggle_item_checked(db, user.id, meal_plan_id, item_id, body.checked)
    return ShoppingListItemResponse.model_validate(item)
