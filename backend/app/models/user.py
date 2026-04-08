# backend/app/models/user.py
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import Column, DateTime, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    # Fields required by fastapi-users (must match these exact names/types)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=320)
    hashed_password: str
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    is_verified: bool = Field(default=False)

    # Profile fields
    display_name: str | None = Field(default=None, max_length=255)
    dietary_restrictions: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    allergies: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    preferred_units: Literal["metric", "imperial"] = Field(
        default="metric",
        sa_column=Column(String(10), nullable=False, server_default="metric"),
    )
    favorite_cuisines: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    disliked_ingredients: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    default_servings: int = Field(default=2)
    meal_plan_system_prompt: str | None = Field(default=None)
    meal_plan_meal_types: list[str] = Field(
        default_factory=lambda: ["dinner"],
        sa_column=Column(JSONB, nullable=False, server_default=text("'[\"dinner\"]'::jsonb")),
    )
    meal_plan_days_ahead: int = Field(default=7)
    auth_providers: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            onupdate=lambda: datetime.now(timezone.utc),
        ),
    )
