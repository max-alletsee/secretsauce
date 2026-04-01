# backend/app/api/routes/import_tasks.py
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.import_task import ImportTask, ImportTaskStatus
from app.models.user import User
from app.schemas.import_task import ImportTaskCreated, ImportTaskRead, RecipeImportURLRequest
from app.services.recipe_import_service import process_url_import

# Mounted at /api/v1/recipes in main.py
recipes_router = APIRouter()

# Mounted at /api/v1/import-tasks in main.py
tasks_router = APIRouter()


@recipes_router.post("/import/url", status_code=202, response_model=ImportTaskCreated)
async def import_recipe_from_url(
    payload: RecipeImportURLRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    task = ImportTask(user_id=user.id, url=str(payload.url))
    db.add(task)
    await db.commit()
    await db.refresh(task)
    # process_url_import creates its own session — do NOT pass db here
    background_tasks.add_task(process_url_import, task.id, str(payload.url), user.id)
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)


@tasks_router.get("/{task_id}", response_model=ImportTaskRead)
async def get_import_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskRead:
    task = await db.get(ImportTask, task_id)
    # Return 404 whether the task doesn't exist or belongs to a different user
    # to avoid leaking whether a task exists.
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Import task not found")
    return ImportTaskRead.model_validate(task)
