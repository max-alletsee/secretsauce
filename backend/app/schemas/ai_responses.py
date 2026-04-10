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
    recipe_source: ImportedRecipeSource | None = None


class MealSuggestionItem(BaseModel):
    title: str
    matched_recipe_id: str | None = None  # str to match Gemini's JSON output


class MealSuggestionResult(BaseModel):
    suggestions: list[MealSuggestionItem]


class ShoppingItemAIResult(BaseModel):
    ingredient_name: str
    total_quantity: float
    unit: str
    detail: str  # e.g. "250 g for Pizza Dough, 150 g for Pancakes"
    recipe_names: list[str]
    category: Literal[
        "Fresh Fruits and Vegetables",
        "Cooled Products, Milk Products",
        "Tinned Products",
        "Sauces, Herbs, Spices, Oils",
        "Broth, sauces, readymade products",
        "Baked products",
        "Spreads for Bread",
        "Deep-frozen products",
        "Coffee and Tea",
        "Cereals, Cornflakes, Müsli",
        "Basic Ingredients for Cooking and Baking",
        "Meat and Fish",
        "Drinks",
        "Sweets and Snacks",
    ]


class ShoppingListAIResult(BaseModel):
    items: list[ShoppingItemAIResult]
