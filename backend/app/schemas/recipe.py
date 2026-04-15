# backend/app/schemas/recipe.py
import html as _html
import uuid
from datetime import datetime
from typing import Literal

import nh3
from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

_STRIP_ALL_TAGS: frozenset[str] = frozenset()
_REMOVE_CONTENT_TAGS: frozenset[str] = frozenset({"script", "style"})


def _strip_html(value: str) -> str:
    """Strip all HTML tags from a string, removing script/style content entirely.

    Uses nh3.clean() to remove tags, then html.unescape() to decode any
    entities that nh3 introduced during sanitization (e.g. & → &amp;).
    """
    cleaned = nh3.clean(value, tags=_STRIP_ALL_TAGS, clean_content_tags=_REMOVE_CONTENT_TAGS)
    return _html.unescape(cleaned)


class Ingredient(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    quantity: str | None = None
    unit: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_html_name(cls, v: object) -> object:
        return _strip_html(v) if isinstance(v, str) else v


class Step(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order: int
    instruction: str

    @field_validator("instruction", mode="before")
    @classmethod
    def strip_html_instruction(cls, v: object) -> object:
        return _strip_html(v) if isinstance(v, str) else v


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

    @field_validator("title", mode="before")
    @classmethod
    def strip_html_title(cls, v: object) -> object:
        return _strip_html(v) if isinstance(v, str) else v

    @field_validator("description", mode="before")
    @classmethod
    def strip_html_description(cls, v: object) -> object:
        return _strip_html(v) if isinstance(v, str) else v


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

    @field_validator("title", mode="before")
    @classmethod
    def strip_html_title(cls, v: object) -> object:
        return _strip_html(v) if isinstance(v, str) else v

    @field_validator("description", mode="before")
    @classmethod
    def strip_html_description(cls, v: object) -> object:
        return _strip_html(v) if isinstance(v, str) else v


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
    popularity_sort_available: bool = False
