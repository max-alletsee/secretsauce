# backend/app/schemas/user.py
import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi_users import schemas
from pydantic import BaseModel


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str | None
    dietary_restrictions: dict[str, Any]
    allergies: dict[str, Any]
    preferred_units: Literal["metric", "imperial"]
    favorite_cuisines: list[str]
    disliked_ingredients: list[str]
    default_servings: int
    meal_plan_system_prompt: str | None
    meal_plan_meal_types: list[str]
    meal_plan_days_ahead: int
    created_at: datetime
    updated_at: datetime


class UserCreate(schemas.BaseUserCreate):
    display_name: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    display_name: str | None = None
    dietary_restrictions: dict[str, Any] | None = None
    allergies: dict[str, Any] | None = None
    preferred_units: Literal["metric", "imperial"] | None = None
    favorite_cuisines: list[str] | None = None
    disliked_ingredients: list[str] | None = None
    default_servings: int | None = None
    meal_plan_system_prompt: str | None = None
    meal_plan_meal_types: list[str] | None = None
    meal_plan_days_ahead: int | None = None


# Token schemas for the custom login + refresh endpoints
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
