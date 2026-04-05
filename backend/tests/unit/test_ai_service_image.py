# backend/tests/unit/test_ai_service_image.py
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.ai_responses import RecipeImportResult
from app.services.ai_service import import_recipe_from_image, AIServiceError


def _mock_response(result: RecipeImportResult):
    mock_resp = MagicMock()
    mock_resp.text = result.model_dump_json()
    mock_resp.usage_metadata = MagicMock(total_token_count=100)
    return mock_resp


@pytest.fixture
def sample_result():
    return RecipeImportResult(
        title="Grandma's Pancakes",
        description="Fluffy pancakes",
        ingredients=[{"name": "flour", "quantity": "2", "unit": "cups"}],
        steps=[{"order": 1, "instruction": "Mix ingredients"}],
        servings=4,
        prep_time_minutes=10,
        cook_time_minutes=15,
        waiting_time_minutes=0,
        tags=["breakfast"],
        recipe_source=None,
    )


async def test_import_recipe_from_image_success(sample_result):
    fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 100  # minimal JPEG-like bytes
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=_mock_response(sample_result))

    with patch("app.services.ai_service._client", mock_client):
        result = await import_recipe_from_image(fake_image, "image/jpeg")

    assert result.title == "Grandma's Pancakes"
    assert len(result.ingredients) == 1
    mock_client.aio.models.generate_content.assert_called_once()


async def test_import_recipe_from_image_raises_on_permanent_failure():
    from google.genai.errors import ClientError
    fake_image = b"\xff\xd8\xff" + b"\x00" * 100

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=ClientError(429, {"error": {"message": "quota exceeded", "status": "RESOURCE_EXHAUSTED", "details": []}})
    )

    with patch("app.services.ai_service._client", mock_client):
        with pytest.raises(AIServiceError):
            await import_recipe_from_image(fake_image, "image/jpeg")


async def test_import_recipe_from_image_does_not_use_url_context(sample_result):
    """Image import must NOT pass url_context tool — only inline image content."""
    fake_image = b"\xff\xd8\xff" + b"\x00" * 100
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=_mock_response(sample_result))

    with patch("app.services.ai_service._client", mock_client):
        await import_recipe_from_image(fake_image, "image/jpeg")

    call_kwargs = mock_client.aio.models.generate_content.call_args
    config = call_kwargs.kwargs.get("config") or call_kwargs.args[2] if len(call_kwargs.args) > 2 else None
    # config.tools should be None or empty (no url_context)
    if config is not None and hasattr(config, "tools") and config.tools:
        tool_types = [type(t).__name__ for t in config.tools]
        assert "UrlContext" not in str(tool_types), "Image import must not use url_context"
