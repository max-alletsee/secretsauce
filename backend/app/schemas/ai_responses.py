# backend/app/schemas/ai_responses.py
from typing import Literal

from pydantic import BaseModel


class ImportedIngredient(BaseModel):
    name: str
    # str (not float) to preserve fractional quantities like "1/2" or "3-4"
    # that Gemini may return. Matches the existing Ingredient.quantity: str type.
    quantity: str | None = None
    unit: str | None = None


class ImportedStep(BaseModel):
    order: int
    instruction: str


class ImportedRecipeSource(BaseModel):
    type: Literal["url"]
    url: str


class RecipeImportResult(BaseModel):
    title: str
    description: str | None = None
    ingredients: list[ImportedIngredient]
    steps: list[ImportedStep]
    servings: int | None = None
    prep_time_minutes: int | None = None
    waiting_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    tags: list[str] = []
    recipe_source: ImportedRecipeSource
