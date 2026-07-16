# backend/app/api/routes/shopping_lists.py
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.import_task import ImportTask, ImportTaskStatus
from app.models.shopping_list import ShoppingList, ShoppingListItem
from app.models.user import User
from app.schemas.import_task import ImportTaskCreated
from app.schemas.shopping_list import (
    ShoppingListGenerateRequest,
    ShoppingListItemCreate,
    ShoppingListItemResponse,
    ShoppingListItemUpdate,
    ShoppingListResponse,
    ShoppingListSummaryResponse,
)
from app.services import shopping as shopping_service
from app.services.ai_budget import ensure_ai_budget
from app.services.shopping import process_shopping_generate

router = APIRouter()


async def _load_items(db: AsyncSession, list_id: uuid.UUID) -> list[ShoppingListItem]:
    result = await db.execute(
        select(ShoppingListItem)
        .where(ShoppingListItem.shopping_list_id == list_id)
        .order_by(ShoppingListItem.created_at.asc())
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


@router.post("/generate", status_code=202, response_model=ImportTaskCreated)
async def generate_shopping_list_endpoint(
    payload: ShoppingListGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    await ensure_ai_budget(db, user)
    task = ImportTask(user_id=user.id, task_type="shopping_generate")
    db.add(task)
    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(
        process_shopping_generate,
        task.id,
        payload.entry_ids,
        payload.name,
        user.id,
    )
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)


@router.get("", response_model=list[ShoppingListSummaryResponse])
async def list_shopping_lists_endpoint(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[ShoppingListSummaryResponse]:
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.user_id == user.id)
        .order_by(ShoppingList.created_at.desc())
    )
    lists = list(result.scalars().all())
    return [ShoppingListSummaryResponse.model_validate(sl) for sl in lists]


@router.get("/{meal_plan_id}", response_model=ShoppingListResponse)
async def get_shopping_list(
    meal_plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ShoppingListResponse:
    shopping_list = await shopping_service.get_or_create_shopping_list(db, user.id, meal_plan_id)
    items = await _load_items(db, shopping_list.id)
    return _to_response(shopping_list, items)


@router.post("/{meal_plan_id}/regenerate", response_model=ShoppingListResponse)
async def regenerate_shopping_list(
    meal_plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ShoppingListResponse:
    await ensure_ai_budget(db, user)
    shopping_list = await shopping_service.regenerate_shopping_list(db, user.id, meal_plan_id)
    items = await _load_items(db, shopping_list.id)
    return _to_response(shopping_list, items)


@router.delete("/{list_id}", status_code=204)
async def delete_shopping_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    await shopping_service.delete_shopping_list(db, user.id, list_id)


@router.patch("/{meal_plan_id}/items/{item_id}", response_model=ShoppingListItemResponse)
async def update_item(
    meal_plan_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ShoppingListItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ShoppingListItemResponse:
    item = await shopping_service.update_item(
        db,
        user.id,
        meal_plan_id,
        item_id,
        checked=body.checked,
        quantity=body.quantity,
        unit=body.unit,
    )
    return ShoppingListItemResponse.model_validate(item)


@router.post("/{meal_plan_id}/items", response_model=ShoppingListItemResponse, status_code=201)
async def create_item(
    meal_plan_id: uuid.UUID,
    body: ShoppingListItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ShoppingListItemResponse:
    item = await shopping_service.create_ad_hoc_item(
        db,
        user.id,
        meal_plan_id,
        ingredient_name=body.ingredient_name,
        quantity=body.quantity,
        unit=body.unit,
        category=body.category,
    )
    return ShoppingListItemResponse.model_validate(item)
