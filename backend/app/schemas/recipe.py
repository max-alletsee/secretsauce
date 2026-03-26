# backend/app/schemas/recipe.py
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field


class Ingredient(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    quantity: str
    unit: str | None = None


class Step(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order: int
    instruction: str


class RecipeSource(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: Literal["url", "book"]
    url: str | None = None
    book_title: str | None = None
    page: int | None = None


class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    ingredients: list[Ingredient] = Field(default_factory=list)
    steps: list[Step] = Field(default_factory=list)
    servings: int = Field(default=2, ge=1)
    prep_time_minutes: int | None = None
    waiting_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    tags: list[str] = Field(default_factory=list)
    recipe_source: RecipeSource | None = None
    visibility: Literal["private", "shared"] = "private"


class RecipeUpdate(BaseModel):
    # MVP limitation: None always means "omit this field" — you cannot clear a nullable
    # time field (prep/waiting/cook/description) back to null via this endpoint.
    # The service uses `field if field is not None else current_version.field` for all fields.
    # Fix in a future iteration using model_fields_set to distinguish omitted vs explicit null.
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    ingredients: list[Ingredient] | None = None
    steps: list[Step] | None = None
    servings: int | None = Field(default=None, ge=1)
    prep_time_minutes: int | None = None
    waiting_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    tags: list[str] | None = None
    recipe_source: RecipeSource | None = None
    visibility: Literal["private", "shared"] | None = None


class RecipeVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    recipe_id: uuid.UUID
    version_number: int
    title: str
    description: str | None
    ingredients: list[Ingredient]
    steps: list[Step]
    servings: int
    prep_time_minutes: int | None
    waiting_time_minutes: int | None
    cook_time_minutes: int | None
    tags: list[str]
    recipe_source: RecipeSource | None
    created_at: datetime
    created_by: uuid.UUID

    @computed_field  # type: ignore[misc]
    @property
    def total_time_minutes(self) -> int | None:
        times = [
            t for t in [self.prep_time_minutes, self.waiting_time_minutes, self.cook_time_minutes]
            if t is not None
        ]
        return sum(times) if times else None


class RecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    visibility: Literal["private", "shared"]
    current_version: RecipeVersionResponse
    created_at: datetime
    updated_at: datetime


class PaginatedRecipeResponse(BaseModel):
    items: list[RecipeResponse]
    next_cursor: str | None
    has_more: bool
