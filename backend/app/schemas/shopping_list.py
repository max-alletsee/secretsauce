# backend/app/schemas/shopping_list.py
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ShoppingListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shopping_list_id: uuid.UUID
    ingredient_name: str
    total_quantity: float
    unit: str
    detail: str
    category: str
    recipe_ids: list[str]
    checked: bool
    created_at: datetime


class ShoppingListItemUpdate(BaseModel):
    checked: bool


class ShoppingListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    meal_plan_id: uuid.UUID | None
    name: str
    items: list[ShoppingListItemResponse] = []
    created_at: datetime
    updated_at: datetime


class ShoppingListGenerateRequest(BaseModel):
    entry_ids: list[uuid.UUID]
    name: str


class ShoppingListSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    from_date: date | None
    to_date: date | None
    created_at: datetime
