# backend/tests/unit/test_ai_suggestions.py
"""Unit test for the matched_recipe_id validation logic in generate_meal_suggestions."""
import pytest
from unittest.mock import AsyncMock, patch
from app.services.ai_service import generate_meal_suggestions
from app.schemas.ai_responses import MealSuggestionItem, MealSuggestionResult


@pytest.mark.asyncio
async def test_unrecognised_recipe_id_is_nulled_out():
    valid_id = "11111111-1111-1111-1111-111111111111"
    invalid_id = "99999999-9999-9999-9999-999999999999"

    mock_result = MealSuggestionResult(suggestions=[
        MealSuggestionItem(title="Pasta", matched_recipe_id=valid_id),
        MealSuggestionItem(title="Mystery Dish", matched_recipe_id=invalid_id),
        MealSuggestionItem(title="Thai curry", matched_recipe_id=None),
    ])

    with patch(
        "app.services.ai_service.call_ai_structured",
        new=AsyncMock(return_value=mock_result),
    ):
        result = await generate_meal_suggestions(
            meal_types=["dinner"],
            days_ahead=3,
            dietary_restrictions={},
            allergies={},
            favorite_cuisines=[],
            disliked_ingredients=[],
            meal_plan_system_prompt=None,
            recipe_collection=[(valid_id, "Pasta")],
            steer_prompt=None,
            carryover_titles=[],
        )

    assert result.suggestions[0].matched_recipe_id == valid_id
    assert result.suggestions[1].matched_recipe_id is None  # was nulled
    assert result.suggestions[2].matched_recipe_id is None  # was already null
