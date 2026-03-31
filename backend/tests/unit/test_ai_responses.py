# backend/tests/unit/test_ai_responses.py
import pytest
from pydantic import ValidationError

from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedRecipeSource,
    ImportedStep,
    RecipeImportResult,
)


def test_recipe_import_result_parses_full_response():
    data = {
        "title": "Spaghetti Carbonara",
        "description": "Classic Italian pasta",
        "ingredients": [
            {"name": "spaghetti", "quantity": "200", "unit": "g"},
            {"name": "eggs", "quantity": "2", "unit": None},
        ],
        "steps": [
            {"order": 1, "instruction": "Boil pasta in salted water"},
            {"order": 2, "instruction": "Fry guanciale until crispy"},
        ],
        "servings": 2,
        "prep_time_minutes": 10,
        "waiting_time_minutes": None,
        "cook_time_minutes": 15,
        "tags": ["italian", "dinner"],
        "recipe_source": {"type": "url", "url": "https://example.com/carbonara"},
    }
    result = RecipeImportResult.model_validate(data)
    assert result.title == "Spaghetti Carbonara"
    assert len(result.ingredients) == 2
    assert result.ingredients[0].quantity == "200"
    assert result.ingredients[1].quantity == "2"
    assert result.ingredients[1].unit is None
    assert len(result.steps) == 2
    assert result.steps[0].order == 1
    assert result.tags == ["italian", "dinner"]
    assert result.recipe_source.url == "https://example.com/carbonara"
    assert result.recipe_source.type == "url"


def test_recipe_import_result_optional_fields_default_to_none():
    data = {
        "title": "Simple Salad",
        "ingredients": [{"name": "lettuce", "quantity": None, "unit": None}],
        "steps": [{"order": 1, "instruction": "Toss everything together"}],
        "recipe_source": {"type": "url", "url": "https://example.com/salad"},
    }
    result = RecipeImportResult.model_validate(data)
    assert result.description is None
    assert result.servings is None
    assert result.prep_time_minutes is None
    assert result.waiting_time_minutes is None
    assert result.cook_time_minutes is None
    assert result.tags == []


def test_recipe_import_result_requires_title():
    data = {
        "ingredients": [{"name": "pasta", "quantity": "200", "unit": "g"}],
        "steps": [{"order": 1, "instruction": "Cook pasta"}],
        "recipe_source": {"type": "url", "url": "https://example.com"},
    }
    with pytest.raises(ValidationError):
        RecipeImportResult.model_validate(data)


def test_imported_ingredient_quantity_accepts_fractions():
    ingredient = ImportedIngredient(name="flour", quantity="1/2", unit="cup")
    assert ingredient.quantity == "1/2"


def test_imported_recipe_source_type_must_be_url():
    with pytest.raises(ValidationError):
        ImportedRecipeSource(type="book", url="https://example.com")  # type: ignore
