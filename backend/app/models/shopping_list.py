# backend/app/models/shopping_list.py
import datetime as _dt
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class ShoppingList(SQLModel, table=True):
    __tablename__ = "shopping_lists"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_shopping_lists_user_id"),
            nullable=False,
            index=True,
        )
    )
    meal_plan_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_shopping_lists_meal_plan_id"),
            nullable=True,
        )
    )
    entry_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    from_date: _dt.date | None = Field(
        default=None,
        sa_column=Column(Date, nullable=True),
    )
    to_date: _dt.date | None = Field(
        default=None,
        sa_column=Column(Date, nullable=True),
    )
    name: str = Field(sa_column=Column(String(255), nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class ShoppingListItem(SQLModel, table=True):
    __tablename__ = "shopping_list_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    shopping_list_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("shopping_lists.id", name="fk_shopping_list_items_list_id"),
            nullable=False,
            index=True,
        )
    )
    ingredient_name: str = Field(sa_column=Column(String(255), nullable=False))
    total_quantity: float = Field(sa_column=Column(Float, nullable=False))
    unit: str = Field(sa_column=Column(String(50), nullable=False))
    detail: str = Field(default="", sa_column=Column(Text, nullable=False))
    category: str = Field(default="", sa_column=Column(String(100), nullable=False))
    recipe_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    checked: bool = Field(
        default=False,
        sa_column=Column(Boolean(), nullable=False, server_default="false"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
