# backend/tests/unit/test_ai_service_meal_suggestions.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.ai_config import MODEL_FLASH_LITE
from app.schemas.ai_responses import MealSuggestionResult
from app.services.ai_service import generate_meal_suggestions

_VALID_RESULT = MealSuggestionResult(suggestions=[])


def _make_mock_client(response_text: str) -> MagicMock:
    mock_response = MagicMock()
    mock_response.text = response_text
    mock_response.usage_metadata = None
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_generate_meal_suggestions_uses_flash_lite_model():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    with patch("app.services.ai_service._client", mock_client):
        await generate_meal_suggestions(
            meal_types=["dinner"],
            days_ahead=1,
            dietary_restrictions=[],
            allergies=[],
            favorite_cuisines=[],
            disliked_ingredients=[],
            meal_plan_system_prompt=None,
            recipe_collection=[],
            steer_prompt=None,
            carryover_titles=[],
        )
    call_kwargs = mock_client.aio.models.generate_content.call_args
    assert call_kwargs.kwargs.get("model") == MODEL_FLASH_LITE
