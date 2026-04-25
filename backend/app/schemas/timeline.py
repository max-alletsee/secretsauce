# backend/app/schemas/timeline.py
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TimelineEntryCreate(BaseModel):
    date: date
    meal_type: str
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] = "recipe"
    servings: int = 2
    source: Literal["ai_suggested", "manual", "carryover"] = "manual"
    position: int = 0


class TimelineEntryUpdate(BaseModel):
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] | None = None
    servings: int | None = None
    position: int | None = None


class TimelineEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    meal_plan_id: uuid.UUID | None
    date: date
    meal_type: str
    recipe_id: uuid.UUID | None
    note: str | None
    entry_type: str
    servings: int
    source: str
    position: int
    created_at: datetime


class TimelineEntriesResponse(BaseModel):
    entries: list[TimelineEntryResponse]
