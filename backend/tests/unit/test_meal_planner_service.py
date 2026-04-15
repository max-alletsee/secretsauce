"""Unit tests for _build_suggestions_prompt — a pure, sync function."""
import pytest
from app.services.ai_service import _build_suggestions_prompt


def _base_kwargs(**overrides) -> dict:
    """Minimal valid kwargs for _build_suggestions_prompt."""
    defaults = dict(
        meal_types=["dinner"],
        days_ahead=3,
        dietary_restrictions={},
        allergies={},
        favorite_cuisines=[],
        disliked_ingredients=[],
        meal_plan_system_prompt=None,
        recipe_collection=[],
        steer_prompt=None,
        carryover_titles=[],
    )
    defaults.update(overrides)
    return defaults


def test_prompt_starts_with_meal_count():
    prompt = _build_suggestions_prompt(**_base_kwargs(meal_types=["dinner"], days_ahead=5))
    # 1 meal type × 5 days = 5 meals
    assert "Plan 5 meals" in prompt


def test_prompt_includes_multiple_meal_types():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(meal_types=["breakfast", "lunch", "dinner"], days_ahead=2)
    )
    # 3 types × 2 days = 6 meals
    assert "Plan 6 meals" in prompt


def test_prompt_includes_dietary_restrictions():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(dietary_restrictions={"vegan": True})
    )
    assert "vegan" in prompt.lower()


def test_prompt_includes_carryover_titles():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(carryover_titles=["Leftover Lasagne", "Cold Soup"])
    )
    assert "Leftover Lasagne" in prompt
    assert "Cold Soup" in prompt


def test_prompt_includes_recipe_collection():
    recipe_id = "11111111-1111-1111-1111-111111111111"
    prompt = _build_suggestions_prompt(
        **_base_kwargs(recipe_collection=[(recipe_id, "Pasta Carbonara")])
    )
    assert "Pasta Carbonara" in prompt
    assert recipe_id in prompt


def test_prompt_includes_steer_prompt():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(steer_prompt="Focus on quick 20-minute meals")
    )
    assert "quick 20-minute meals" in prompt


def test_prompt_includes_favorite_cuisines():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(favorite_cuisines=["italian", "japanese"])
    )
    assert "italian" in prompt
    assert "japanese" in prompt


def test_prompt_omits_empty_fields():
    prompt = _build_suggestions_prompt(**_base_kwargs())
    # No empty sections should appear for unset optional fields
    assert "Dietary restrictions" not in prompt
    assert "Allergies" not in prompt
    assert "Favorite cuisines" not in prompt
    assert "User instructions" not in prompt


def test_prompt_includes_custom_system_prompt():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(meal_plan_system_prompt="Always include a soup on Thursdays")
    )
    assert "Always include a soup on Thursdays" in prompt


def test_prompt_ends_with_diversity_instruction():
    prompt = _build_suggestions_prompt(**_base_kwargs(meal_types=["dinner"], days_ahead=1))
    assert "diverse" in prompt.lower()
