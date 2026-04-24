# backend/app/services/recipe_import_service.py
import asyncio
import logging
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.core.constants import ALL_TAGS
from app.core.database import async_session_factory
from app.models.import_task import ImportTask, ImportTaskStatus
from app.schemas.ai_responses import RecipeImportResult
from app.schemas.recipe import Ingredient, RecipeCreate, RecipeSource, RecipeVersionResponse, Step
from app.services import ai_service, recipe_service

logger = logging.getLogger(__name__)


def _build_recipe_payload(recipe, version) -> dict:
    """Serialize recipe + version into the result_data["recipe"] dict."""
    version_data = RecipeVersionResponse.model_validate(version, from_attributes=True).model_dump(mode="json")
    return {
        "id": str(recipe.id),
        "visibility": recipe.visibility,
        "current_version": version_data,
    }


async def process_url_import(task_id: uuid.UUID, url: str, user_id: uuid.UUID) -> None:
    """Background task: call Gemini to extract a recipe from url, save it, update the task.

    Creates its own AsyncSession because BackgroundTasks run after the request session closes.
    """
    async with async_session_factory() as db:
        task = await db.get(ImportTask, task_id)
        if task is None:
            logger.error("ImportTask %s not found — skipping", task_id)
            return

        task.status = ImportTaskStatus.PROCESSING
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)
        await db.commit()

        try:
            result: RecipeImportResult = await ai_service.import_recipe_from_url(url, user_id=user_id, db=db)

            if not result.title:
                raise ValueError("Extracted recipe has no title")
            if not result.ingredients:
                raise ValueError("Extracted recipe has no ingredients")
            if not result.steps:
                raise ValueError("Extracted recipe has no steps")

            # Drop any tags Gemini returned that aren't in the pre-built set
            filtered_tags = [t for t in result.tags if t in ALL_TAGS]

            recipe_data = RecipeCreate(
                title=result.title,
                description=result.description,
                ingredients=[
                    Ingredient(name=i.name, quantity=i.quantity, unit=i.unit)
                    for i in result.ingredients
                ],
                steps=[
                    Step(order=s.order, instruction=s.instruction)
                    for s in result.steps
                ],
                servings=result.servings if result.servings is not None else 2,
                prep_time_minutes=result.prep_time_minutes,
                waiting_time_minutes=result.waiting_time_minutes,
                cook_time_minutes=result.cook_time_minutes,
                tags=filtered_tags,
                recipe_source=RecipeSource(type="url", url=url),
            )

            recipe, version = await recipe_service.create_recipe(db, user_id, recipe_data)

            task.status = ImportTaskStatus.COMPLETED
            task.recipe_id = recipe.id
            task.result_data = {"recipe": _build_recipe_payload(recipe, version)}
            task.updated_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.error("Import task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)

        db.add(task)
        await db.commit()


async def process_image_import(
    task_id: uuid.UUID,
    image_path: str,
    user_id: uuid.UUID,
) -> None:
    """Background task: read image file, call AI, create recipe, update task status.

    Creates its own AsyncSession because BackgroundTasks run after the request session closes.
    """
    async with async_session_factory() as db:
        task = await db.get(ImportTask, task_id)
        if task is None:
            logger.error("process_image_import: task %s not found — skipping", task_id)
            return

        task.status = ImportTaskStatus.PROCESSING
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)
        await db.commit()

        try:
            image_bytes: bytes = await asyncio.to_thread(Path(image_path).read_bytes)
            mime_type, _ = mimetypes.guess_type(image_path)
            if mime_type is None:
                mime_type = "image/jpeg"

            result: RecipeImportResult = await ai_service.import_recipe_from_image(
                image_bytes, mime_type, user_id=user_id, db=db
            )

            if not result.title:
                raise ValueError("Extracted recipe has no title")
            if not result.ingredients:
                raise ValueError("Extracted recipe has no ingredients")
            if not result.steps:
                raise ValueError("Extracted recipe has no steps")

            # Drop any tags Gemini returned that aren't in the pre-built set
            filtered_tags = [t for t in (result.tags or []) if t in ALL_TAGS]

            recipe_data = RecipeCreate(
                title=result.title,
                description=result.description,
                ingredients=[
                    Ingredient(name=i.name, quantity=i.quantity, unit=i.unit)
                    for i in result.ingredients
                ],
                steps=[
                    Step(order=s.order, instruction=s.instruction)
                    for s in result.steps
                ],
                servings=result.servings if result.servings is not None else 2,
                prep_time_minutes=result.prep_time_minutes,
                waiting_time_minutes=result.waiting_time_minutes,
                cook_time_minutes=result.cook_time_minutes,
                tags=filtered_tags,
                recipe_source=None,
            )

            recipe, version = await recipe_service.create_recipe(db, user_id, recipe_data)

            task.status = ImportTaskStatus.COMPLETED
            task.recipe_id = recipe.id
            task.result_data = {"recipe": _build_recipe_payload(recipe, version)}
            task.updated_at = datetime.now(timezone.utc)
            logger.info(
                "process_image_import: task %s completed, recipe %s", task_id, recipe.id
            )

        except Exception as exc:
            logger.error("process_image_import: task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)

        db.add(task)
        await db.commit()
