# backend/app/services/recipe_import_service.py
import logging
import uuid
from datetime import datetime, timezone

from app.core.constants import ALL_TAGS
from app.core.database import async_session_factory
from app.models.import_task import ImportTask, ImportTaskStatus
from app.schemas.ai_responses import RecipeImportResult
from app.schemas.recipe import Ingredient, RecipeCreate, RecipeSource, Step
from app.services import ai_service, recipe_service

logger = logging.getLogger(__name__)


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
            result: RecipeImportResult = await ai_service.import_recipe_from_url(url)

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

            recipe, _ = await recipe_service.create_recipe(db, user_id, recipe_data)

            task.status = ImportTaskStatus.COMPLETED
            task.recipe_id = recipe.id
            task.updated_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.error("Import task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)

        db.add(task)
        await db.commit()
