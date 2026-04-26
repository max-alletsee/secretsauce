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


def _make_version_mock(recipe_id: uuid.UUID) -> MagicMock:
    """Return a MagicMock with all fields required by RecipeVersionResponse."""
    import datetime as _dt

    v = MagicMock()
    v.id = uuid.uuid4()
    v.recipe_id = recipe_id
    v.version_number = 1
    v.title = "Pasta"
    v.description = "Simple pasta"
    v.ingredients = [{"name": "pasta", "quantity": "200", "unit": "g"}]
    v.steps = [{"order": 1, "instruction": "Cook pasta until al dente"}]
    v.servings = 2
    v.prep_time_minutes = 5
    v.waiting_time_minutes = None
    v.cook_time_minutes = 10
    v.tags = ["italian", "dinner"]
    v.recipe_source = None
    v.created_at = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)
    return v


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
    mock_version = _make_version_mock(recipe_id)
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
                AsyncMock(return_value=(mock_recipe, mock_version)),
            ):
                await process_url_import(task_id, _URL, user_id)

    assert mock_task.status == ImportTaskStatus.COMPLETED
    assert mock_task.recipe_id == recipe_id


@pytest.mark.asyncio
async def test_process_url_import_filters_unknown_tags():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id
    mock_version = _make_version_mock(recipe_id)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    captured: dict = {}

    async def capture_create(db, owner_id, data):
        captured["tags"] = data.tags
        return (mock_recipe, mock_version)

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
    mock_version = _make_version_mock(recipe_id)
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
                    AsyncMock(return_value=(mock_recipe, mock_version)),
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
async def test_process_url_import_embeds_result_data():
    """After a successful import, task.result_data["recipe"] must be a dict with title/ingredients/steps."""
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    fake_result = RecipeImportResult(
        title="Pasta Carbonara",
        description="A classic Roman pasta.",
        ingredients=[ImportedIngredient(name="spaghetti", quantity="200", unit="g")],
        steps=[ImportedStep(order=1, instruction="Cook pasta.")],
        servings=2,
        tags=["italian", "dinner"],
    )

    import datetime as _dt

    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id

    mock_version = MagicMock()
    mock_version.id = uuid.uuid4()
    mock_version.recipe_id = recipe_id
    mock_version.version_number = 1
    mock_version.title = "Pasta Carbonara"
    mock_version.description = "A classic Roman pasta."
    mock_version.ingredients = [{"name": "spaghetti", "quantity": "200", "unit": "g"}]
    mock_version.steps = [{"order": 1, "instruction": "Cook pasta."}]
    mock_version.servings = 2
    mock_version.prep_time_minutes = None
    mock_version.waiting_time_minutes = None
    mock_version.cook_time_minutes = None
    mock_version.tags = ["italian", "dinner"]
    mock_version.recipe_source = None
    mock_version.created_at = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)

    mock_task = MagicMock()
    mock_task.id = task_id
    mock_task.result_data = None

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=mock_task)
    mock_db.commit = AsyncMock()

    with (
        patch("app.services.recipe_import_service.async_session_factory") as mock_factory,
        patch("app.services.recipe_import_service.ai_service.import_recipe_from_url", new_callable=AsyncMock, return_value=fake_result),
        patch("app.services.recipe_import_service.recipe_service.create_recipe", return_value=(mock_recipe, mock_version)),
    ):
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.services.recipe_import_service import process_url_import
        await process_url_import(task_id, "https://example.com/recipe", user_id)

    assert mock_task.result_data is not None
    assert "recipe" in mock_task.result_data
    recipe_data = mock_task.result_data["recipe"]
    assert recipe_data["id"] == str(recipe_id)
    assert recipe_data["current_version"]["title"] == "Pasta Carbonara"
    assert len(recipe_data["current_version"]["ingredients"]) == 1
    assert len(recipe_data["current_version"]["steps"]) == 1


@pytest.mark.asyncio
async def test_process_image_import_embeds_result_data():
    """After a successful image import, task.result_data["recipe"] must contain version data."""
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()
    import datetime as _dt

    fake_result = RecipeImportResult(
        title="Omelette",
        description="Simple egg dish.",
        ingredients=[ImportedIngredient(name="eggs", quantity="3", unit="")],
        steps=[ImportedStep(order=1, instruction="Beat eggs.")],
        servings=1,
        tags=["breakfast"],
    )

    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id

    mock_version = MagicMock()
    mock_version.id = uuid.uuid4()
    mock_version.recipe_id = recipe_id
    mock_version.version_number = 1
    mock_version.title = "Omelette"
    mock_version.description = "Simple egg dish."
    mock_version.ingredients = [{"name": "eggs", "quantity": "3", "unit": ""}]
    mock_version.steps = [{"order": 1, "instruction": "Beat eggs."}]
    mock_version.servings = 1
    mock_version.prep_time_minutes = None
    mock_version.waiting_time_minutes = None
    mock_version.cook_time_minutes = None
    mock_version.tags = ["breakfast"]
    mock_version.recipe_source = None
    mock_version.created_at = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)

    mock_task = MagicMock()
    mock_task.id = task_id
    mock_task.result_data = None

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=mock_task)
    mock_db.commit = AsyncMock()

    with (
        patch("app.services.recipe_import_service.async_session_factory") as mock_factory,
        patch("app.services.recipe_import_service.ai_service.import_recipe_from_image", new_callable=AsyncMock, return_value=fake_result),
        patch("app.services.recipe_import_service.recipe_service.create_recipe", return_value=(mock_recipe, mock_version)),
        patch("asyncio.to_thread", new_callable=AsyncMock, return_value=b"fake-image-bytes"),
        patch("mimetypes.guess_type", return_value=("image/jpeg", None)),
    ):
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.services.recipe_import_service import process_image_import
        await process_image_import(task_id, "/tmp/fake.jpg", user_id)

    assert mock_task.result_data is not None
    assert "recipe" in mock_task.result_data
    assert mock_task.result_data["recipe"]["id"] == str(recipe_id)
    assert mock_task.result_data["recipe"]["current_version"]["title"] == "Omelette"


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


# --- Generate task tests ---


@pytest.mark.asyncio
async def test_process_generate_task_happy_path():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id
    mock_version = _make_version_mock(recipe_id)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    fake_result = RecipeImportResult(
        title="Chicken Tikka Masala",
        description="Rich Indian curry.",
        ingredients=[ImportedIngredient(name="chicken", quantity="500", unit="g")],
        steps=[ImportedStep(order=1, instruction="Marinate chicken.")],
        servings=4,
        tags=["indian", "dinner"],
    )

    from app.services.recipe_import_service import process_generate_task

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ), patch(
        "app.services.recipe_import_service.ai_service.generate_recipe_from_title",
        AsyncMock(return_value=fake_result),
    ), patch(
        "app.services.recipe_import_service.recipe_service.create_recipe",
        AsyncMock(return_value=(mock_recipe, mock_version)),
    ):
        await process_generate_task(task_id, "Chicken Tikka Masala", user_id)

    assert mock_task.status == ImportTaskStatus.COMPLETED
    assert mock_task.recipe_id == recipe_id
    assert mock_task.result_data is not None
    assert mock_task.result_data["recipe"]["current_version"]["title"] == "Pasta"


@pytest.mark.asyncio
async def test_process_generate_task_ai_failure():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    from app.services.recipe_import_service import process_generate_task

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ), patch(
        "app.services.recipe_import_service.ai_service.generate_recipe_from_title",
        AsyncMock(side_effect=AIServiceError("Gemini timed out")),
    ):
        await process_generate_task(task_id, "Chicken Tikka Masala", user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "Gemini timed out" in mock_task.error_message
