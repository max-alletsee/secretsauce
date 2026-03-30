# backend/tests/unit/test_recipe_models.py
import uuid

from app.models.recipe import Recipe, RecipeVersion


def test_recipe_has_required_fields():
    fields = set(Recipe.model_fields.keys())
    assert {"id", "owner_id", "current_version_id", "visibility", "created_at", "updated_at"} <= fields


def test_recipe_version_has_required_fields():
    fields = set(RecipeVersion.model_fields.keys())
    assert {
        "id", "recipe_id", "version_number", "title", "description",
        "ingredients", "steps", "servings", "prep_time_minutes",
        "waiting_time_minutes", "cook_time_minutes", "tags",
        "recipe_source", "created_at",
    } <= fields


def test_total_time_minutes_is_not_a_db_column():
    assert "total_time_minutes" not in Recipe.model_fields
    assert "total_time_minutes" not in RecipeVersion.model_fields


def test_recipe_defaults():
    recipe = Recipe(owner_id=uuid.uuid4())
    assert recipe.visibility == "private"
    assert recipe.current_version_id is None


def test_recipe_version_defaults():
    version = RecipeVersion(
        recipe_id=uuid.uuid4(),
        title="Test",
    )
    assert version.version_number == 1
    assert version.ingredients == []
    assert version.steps == []
    assert version.tags == []
    assert version.servings == 2
