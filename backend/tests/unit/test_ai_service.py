# backend/tests/unit/test_ai_service.py
import asyncio
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedRecipeSource,
    ImportedStep,
    RecipeImportResult,
)
from app.services.ai_service import AIServiceError, import_recipe_from_url

_VALID_RESULT = RecipeImportResult(
    title="Pasta",
    description="Simple pasta",
    ingredients=[ImportedIngredient(name="pasta", quantity="200", unit="g")],
    steps=[ImportedStep(order=1, instruction="Cook pasta")],
    servings=2,
    prep_time_minutes=5,
    waiting_time_minutes=None,
    cook_time_minutes=10,
    tags=["italian"],
    recipe_source=ImportedRecipeSource(type="url", url="https://example.com/pasta"),
)


def _make_mock_client(response_text: str) -> MagicMock:
    mock_response = MagicMock()
    mock_response.text = response_text
    mock_response.usage_metadata = None
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_import_recipe_from_url_success():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    with patch("app.services.ai_service._client", mock_client):
        result = await import_recipe_from_url("https://example.com/pasta")
    assert result.title == "Pasta"
    assert len(result.ingredients) == 1
    assert result.ingredients[0].name == "pasta"
    assert result.recipe_source.url == "https://example.com/pasta"


@pytest.mark.asyncio
async def test_import_recipe_from_url_retries_on_transient_failure():
    mock_response = MagicMock()
    mock_response.text = _VALID_RESULT.model_dump_json()
    mock_response.usage_metadata = None
    mock_client = MagicMock()
    # first call fails, second succeeds
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=[Exception("network error"), mock_response]
    )
    with patch("app.services.ai_service._client", mock_client):
        with patch("asyncio.sleep", AsyncMock()):
            result = await import_recipe_from_url("https://example.com/pasta")
    assert result.title == "Pasta"
    assert mock_client.aio.models.generate_content.call_count == 2


@pytest.mark.asyncio
async def test_import_recipe_from_url_raises_after_max_retries():
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("persistent server error")
    )
    with patch("app.services.ai_service._client", mock_client):
        with patch("asyncio.sleep", AsyncMock()):
            with pytest.raises(AIServiceError, match="Import failed after"):
                await import_recipe_from_url("https://example.com/pasta")
    assert mock_client.aio.models.generate_content.call_count == 3  # AI_MAX_RETRIES default


@pytest.mark.asyncio
async def test_import_recipe_from_url_passes_url_in_prompt():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    url = "https://example.com/my-recipe"
    with patch("app.services.ai_service._client", mock_client):
        await import_recipe_from_url(url)
    call_kwargs = mock_client.aio.models.generate_content.call_args
    contents = call_kwargs.kwargs.get("contents") or call_kwargs.args[1]
    assert url in contents
