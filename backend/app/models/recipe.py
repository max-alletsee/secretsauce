# backend/app/models/recipe.py
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class Recipe(SQLModel, table=True):
    __tablename__ = "recipes"
    __table_args__ = (
        # Compound index for cursor-based pagination (ORDER BY created_at DESC, id DESC)
        Index("ix_recipes_created_at_id", "created_at", "id"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("users.id", name="fk_recipes_owner_id"),
            nullable=False,
            index=True,
        )
    )
    # use_alter=True breaks the circular FK between recipes ↔ recipe_versions.
    # Alembic emits this as a separate CREATE CONSTRAINT after both tables exist.
    # NOTE: async sessions using session.execute(update(...)) do NOT fire onupdate.
    # Always set updated_at explicitly in service layer on every write.
    current_version_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            sa.Uuid(),
            ForeignKey(
                "recipe_versions.id",
                use_alter=True,
                name="fk_recipes_current_version_id",
            ),
            nullable=True,
        ),
    )
    visibility: Literal["private", "shared"] = Field(
        default="private",
        sa_column=Column(String(10), nullable=False, server_default="private"),
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


class RecipeVersion(SQLModel, table=True):
    __tablename__ = "recipe_versions"
    __table_args__ = (
        # Compound index for efficient version listing (ORDER BY version_number DESC per recipe)
        Index("ix_recipe_versions_recipe_id_version_number", "recipe_id", "version_number"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    recipe_id: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("recipes.id", name="fk_recipe_versions_recipe_id"),
            nullable=False,
        )
    )
    version_number: int = Field(default=1)
    title: str = Field(max_length=500)
    description: str | None = Field(default=None)
    ingredients: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    steps: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    servings: int = Field(default=2)
    prep_time_minutes: int | None = Field(default=None)
    waiting_time_minutes: int | None = Field(default=None)
    cook_time_minutes: int | None = Field(default=None)
    tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    recipe_source: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    created_by: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("users.id", name="fk_recipe_versions_created_by"),
            nullable=False,
        )
    )
