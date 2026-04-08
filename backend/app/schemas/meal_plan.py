import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MealPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    start_date: date
    end_date: date


class MealPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    status: Literal["draft", "active", "completed"]
    created_at: datetime
    updated_at: datetime


class MealPlanEntryCreate(BaseModel):
    date: date
    meal_type: str  # breakfast | lunch | dinner | snack
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] = "recipe"
    servings: int = Field(default=2, ge=1)
    source: Literal["ai_suggested", "manual", "carryover"] = "manual"
    position: int = 0


class MealPlanEntryUpdate(BaseModel):
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] | None = None
    servings: int | None = Field(default=None, ge=1)
    position: int | None = None


class MealPlanEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    meal_plan_id: uuid.UUID
    date: date
    meal_type: str
    recipe_id: uuid.UUID | None
    note: str | None
    entry_type: str
    servings: int
    source: str
    position: int
    created_at: datetime


class MealPlanWithEntries(MealPlanResponse):
    entries: list[MealPlanEntryResponse] = []


class ShortlistEntryCreate(BaseModel):
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion"] = "recipe"


class ShortlistEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    recipe_id: uuid.UUID | None
    note: str | None
    entry_type: str
    position: int
    created_at: datetime


class ShortlistReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]


class SuggestionsRequest(BaseModel):
    meal_plan_id: uuid.UUID | None = None
    steer_prompt: str | None = None


class LogEntry(BaseModel):
    entry_id: uuid.UUID
    outcome: Literal["cooked", "not_cooked", "leftover"]


class MealPlanLogRequest(BaseModel):
    entries: list[LogEntry]


class CarryoverMealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    recipe_id: uuid.UUID
    original_date: date
    original_meal_type: str
    reason: str
    resolved: bool
    created_at: datetime
