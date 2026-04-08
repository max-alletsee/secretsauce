# backend/app/models/meal_plan.py
import uuid
import datetime as _dt
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class MealPlan(SQLModel, table=True):
    __tablename__ = "meal_plans"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", name="fk_meal_plans_user_id"),
            nullable=False, index=True,
        )
    )
    name: str = Field(sa_column=Column(String(255), nullable=False))
    start_date: _dt.date = Field(sa_column=Column(Date, nullable=False))
    end_date: _dt.date = Field(sa_column=Column(Date, nullable=False))
    status: Literal["draft", "active", "completed"] = Field(
        default="draft",
        sa_column=Column(String(20), nullable=False, server_default="draft"),
    )
    ai_prompt_used: str | None = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class MealPlanEntry(SQLModel, table=True):
    __tablename__ = "meal_plan_entries"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    meal_plan_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_meal_plan_entries_plan_id"),
            nullable=False,
            index=True,
        )
    )
    date: _dt.date = Field(sa_column=Column(Date, nullable=False))
    meal_type: str = Field(sa_column=Column(String(20), nullable=False))
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_meal_plan_entries_recipe_id"),
            nullable=True,
        ),
    )
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entry_type: str = Field(
        default="recipe",
        sa_column=Column(String(20), nullable=False, server_default="recipe"),
    )
    servings: int = Field(
        default=2,
        sa_column=Column(Integer(), nullable=False, server_default="2"),
    )
    source: str = Field(
        default="manual",
        sa_column=Column(String(20), nullable=False, server_default="manual"),
    )
    position: int = Field(
        default=0,
        sa_column=Column(Integer(), nullable=False, server_default="0"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class ShortlistEntry(SQLModel, table=True):
    __tablename__ = "shortlist_entries"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_shortlist_entries_user_id"),
            nullable=False,
            index=True,
        )
    )
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_shortlist_entries_recipe_id"),
            nullable=True,
        ),
    )
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entry_type: str = Field(
        default="recipe",
        sa_column=Column(String(20), nullable=False, server_default="recipe"),
    )
    position: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class RecipeCookLog(SQLModel, table=True):
    __tablename__ = "recipe_cook_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_cook_logs_user_id"),
            nullable=False,
            index=True,
        )
    )
    recipe_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_cook_logs_recipe_id"),
            nullable=False,
        )
    )
    meal_plan_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_cook_logs_meal_plan_id"),
            nullable=True,
        ),
    )
    cooked_at: _dt.date = Field(sa_column=Column(Date, nullable=False))
    rating: int | None = Field(
        default=None,
        sa_column=Column(Integer(), nullable=True),
    )
    notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class CarryoverMeal(SQLModel, table=True):
    __tablename__ = "carryover_meals"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_carryover_meals_user_id"),
            nullable=False,
            index=True,
        )
    )
    source_meal_plan_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_carryover_source_plan_id"),
            nullable=False,
        )
    )
    recipe_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_carryover_recipe_id"),
            nullable=False,
        )
    )
    original_date: _dt.date = Field(sa_column=Column(Date, nullable=False))
    original_meal_type: str = Field(sa_column=Column(String(20), nullable=False))
    reason: str = Field(sa_column=Column(String(20), nullable=False))
    target_meal_plan_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_carryover_target_plan_id"),
            nullable=True,
        ),
    )
    resolved: bool = Field(
        default=False,
        sa_column=Column(Boolean(), nullable=False, server_default="false"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
