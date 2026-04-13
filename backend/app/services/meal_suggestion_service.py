# backend/app/services/meal_suggestion_service.py
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.import_task import ImportTask, ImportTaskStatus
from app.models.meal_plan import MealPlan
from app.models.recipe import Recipe, RecipeVersion

logger = logging.getLogger(__name__)


async def process_suggestions_task(
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID | None,
    steer_prompt: str | None,
) -> None:
    """Background task: generate meal suggestions and store result in ImportTask.result_data."""
    from app.services import ai_service

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
            from app.models.user import User
            user = await db.get(User, user_id)
            if user is None:
                raise ValueError(f"User {user_id} not found")

            # Fetch user's recipe collection (id, title) pairs
            result = await db.execute(
                select(Recipe.id, RecipeVersion.title)
                .join(RecipeVersion, Recipe.current_version_id == RecipeVersion.id)
                .where(Recipe.owner_id == user_id)
            )
            recipe_collection = [(str(row.id), row.title) for row in result]

            # Fetch unresolved carryover titles (Phase 6 — empty until Phase 6 is implemented)
            carryover_titles: list[str] = []

            suggestions_result = await ai_service.generate_meal_suggestions(
                meal_types=user.meal_plan_meal_types,
                days_ahead=user.meal_plan_days_ahead,
                dietary_restrictions=user.dietary_restrictions,
                allergies=user.allergies,
                favorite_cuisines=user.favorite_cuisines,
                disliked_ingredients=user.disliked_ingredients,
                meal_plan_system_prompt=user.meal_plan_system_prompt,
                recipe_collection=recipe_collection,
                steer_prompt=steer_prompt,
                carryover_titles=carryover_titles,
                user_id=user_id,
                db=db,
            )

            result_data = {
                "suggestions": [
                    {
                        "title": s.title,
                        "matched_recipe_id": s.matched_recipe_id,
                        "entry_type": "recipe" if s.matched_recipe_id else "suggestion",
                    }
                    for s in suggestions_result.suggestions
                ]
            }

            # Write ai_prompt_used to the meal plan if one was provided
            if meal_plan_id is not None:
                plan = await db.get(MealPlan, meal_plan_id)
                if plan and plan.user_id == user_id:
                    from app.services.ai_service import _build_suggestions_prompt
                    plan.ai_prompt_used = _build_suggestions_prompt(
                        meal_types=user.meal_plan_meal_types,
                        days_ahead=user.meal_plan_days_ahead,
                        dietary_restrictions=user.dietary_restrictions,
                        allergies=user.allergies,
                        favorite_cuisines=user.favorite_cuisines,
                        disliked_ingredients=user.disliked_ingredients,
                        meal_plan_system_prompt=user.meal_plan_system_prompt,
                        recipe_collection=recipe_collection,
                        steer_prompt=steer_prompt,
                        carryover_titles=carryover_titles,
                    )
                    plan.updated_at = datetime.now(timezone.utc)
                    db.add(plan)

            task.result_data = result_data
            task.status = ImportTaskStatus.COMPLETED
            task.updated_at = datetime.now(timezone.utc)
            db.add(task)
            await db.commit()

        except Exception as exc:
            logger.error("Suggestions task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)
            db.add(task)
            await db.commit()
