# backend/tests/unit/test_recipe_import_service.py
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.import_task import ImportTask, ImportTaskStatus
from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedRecipeSource,
    ImportedStep,
    RecipeImportResult,
)
from app.services.ai_service import AIServiceError
from app.services.recipe_import_service import process_image_import, process_url_import

_URL = "https://example.com/pasta"


def _valid_result(url: str = _URL) -> RecipeImportResult:
    return RecipeImportResult(
        title="Pasta",
        description="Simple pasta",
        ingredients=[ImportedIngredient(name="pasta", quantity="200", unit="g")],
        steps=[ImportedStep(order=1, instruction="Cook pasta until al dente")],
        servings=2,
        prep_time_minutes=5,
        waiting_time_minutes=None,
        cook_time_minutes=10,
        # includes a tag that's not in ALL_TAGS — should be silently dropped
        tags=["italian", "dinner", "totally-made-up-tag"],
        recipe_source=ImportedRecipeSource(type="url", url=url),
    )


def _make_db_and_session_ctx(mock_task: MagicMock) -> tuple[AsyncMock, MagicMock]:
    """Return (mock_db, mock_session_ctx) where mock_db.get returns mock_task."""
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=mock_task)
    mock_db.add = MagicMock()  # add() is sync in SQLAlchemy

    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    return mock_db, mock_session_ctx


@pytest.mark.asyncio
async def test_process_url_import_happy_path():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=_valid_result()),
        ):
            with patch(
                "app.services.recipe_import_service.recipe_service.create_recipe",
                AsyncMock(return_value=(mock_recipe, MagicMock())),
            ):
                await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.COMPLETED
    assert mock_task.recipe_id == recipe_id


@pytest.mark.asyncio
async def test_process_url_import_filters_unknown_tags():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = uuid.uuid4()
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    captured: dict = {}

    async def capture_create(db, owner_id, data):
        captured["tags"] = data.tags
        return (mock_recipe, MagicMock())

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=_valid_result()),
        ):
            with patch(
                "app.services.recipe_import_service.recipe_service.create_recipe",
                capture_create,
            ):
                await process_url_import(task_id, _URL, user_id)

    assert "italian" in captured["tags"]
    assert "dinner" in captured["tags"]
    assert "totally-made-up-tag" not in captured["tags"]


@pytest.mark.asyncio
async def test_process_url_import_sets_failed_on_ai_error():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(side_effect=AIServiceError("Gemini timeout")),
        ):
            await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "Gemini timeout" in mock_task.error_message


@pytest.mark.asyncio
async def test_process_url_import_fails_on_empty_ingredients():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    no_ingredients = RecipeImportResult(
        title="Pasta",
        ingredients=[],
        steps=[ImportedStep(order=1, instruction="Cook pasta")],
        recipe_source=ImportedRecipeSource(type="url", url=_URL),
    )

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=no_ingredients),
        ):
            await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "no ingredients" in mock_task.error_message


@pytest.mark.asyncio
async def test_process_url_import_fails_on_empty_steps():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    no_steps = RecipeImportResult(
        title="Pasta",
        ingredients=[ImportedIngredient(name="pasta", quantity="200", unit="g")],
        steps=[],
        recipe_source=ImportedRecipeSource(type="url", url=_URL),
    )

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_url",
            AsyncMock(return_value=no_steps),
        ):
            await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "no steps" in mock_task.error_message


# --- Image import tests ---

_FAKE_JPEG = b"\xff\xd8\xff" + b"\x00" * 100
_IMAGE_PATH = "/tmp/recipe.jpg"


def _valid_image_result() -> RecipeImportResult:
    return RecipeImportResult(
        title="Handwritten Pasta",
        description="From grandma's cookbook",
        ingredients=[ImportedIngredient(name="pasta", quantity="200", unit="g")],
        steps=[ImportedStep(order=1, instruction="Boil pasta")],
        servings=2,
        prep_time_minutes=5,
        cook_time_minutes=10,
        waiting_time_minutes=0,
        tags=["dinner", "italian"],
        recipe_source=None,
    )


@pytest.mark.asyncio
async def test_process_image_import_happy_path():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_image",
            AsyncMock(return_value=_valid_image_result()),
        ):
            with patch(
                "app.services.recipe_import_service.asyncio.to_thread",
                AsyncMock(return_value=_FAKE_JPEG),
            ):
                with patch(
                    "app.services.recipe_import_service.recipe_service.create_recipe",
                    AsyncMock(return_value=(mock_recipe, MagicMock())),
                ):
                    await process_image_import(task_id, _IMAGE_PATH, user_id)

    assert mock_task.status == ImportTaskStatus.COMPLETED
    assert mock_task.recipe_id == recipe_id


@pytest.mark.asyncio
async def test_process_image_import_sets_failed_on_ai_error():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_image",
            AsyncMock(side_effect=AIServiceError("Gemini timed out")),
        ):
            with patch(
                "app.services.recipe_import_service.asyncio.to_thread",
                AsyncMock(return_value=_FAKE_JPEG),
            ):
                await process_image_import(task_id, _IMAGE_PATH, user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "Gemini timed out" in mock_task.error_message


@pytest.mark.asyncio
async def test_process_image_import_task_not_found_returns_early():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=None)
    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        # Should return without error when task not found
        await process_image_import(task_id, _IMAGE_PATH, user_id)

    # commit should not be called if task is missing
    mock_db.commit.assert_not_called()
