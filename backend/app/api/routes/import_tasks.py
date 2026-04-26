# backend/app/api/routes/import_tasks.py
import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.core.rate_limit import check_import_rate_limit
from app.core.security import current_active_user
from app.models.import_task import ImportTask, ImportTaskStatus
from app.models.user import User
from app.schemas.import_task import ImportTaskCreated, ImportTaskRead, RecipeGenerateRequest, RecipeImportURLRequest
from app.services.recipe_import_service import process_generate_task, process_image_import, process_url_import

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
    check_import_rate_limit(str(user.id))
    task = ImportTask(user_id=user.id, url=str(payload.url))
    db.add(task)
    await db.commit()
    await db.refresh(task)
    # process_url_import creates its own session — do NOT pass db here
    background_tasks.add_task(process_url_import, task.id, str(payload.url), user.id)
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)


@recipes_router.post("/generate", status_code=202, response_model=ImportTaskCreated)
async def generate_recipe(
    payload: RecipeGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    check_import_rate_limit(str(user.id))
    task = ImportTask(user_id=user.id, task_type="recipe_generate")
    db.add(task)
    await db.commit()
    await db.refresh(task)
    # process_generate_task creates its own session — do NOT pass db here
    background_tasks.add_task(process_generate_task, task.id, payload.title, user.id)
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
    return ImportTaskRead.from_orm_task(task)


_MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
_ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}


@recipes_router.post("/import/image", status_code=202, response_model=ImportTaskCreated)
async def import_recipe_from_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    check_import_rate_limit(str(user.id))

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="File must be an image")

    content = await file.read()
    if len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="File too large (max 10 MB)")

    raw_ext = Path(file.filename or "upload").suffix.lower()
    ext = raw_ext if raw_ext in _ALLOWED_IMAGE_EXTENSIONS else ".jpg"
    dest_path = Path(settings.UPLOAD_DIR) / f"{uuid.uuid4()}{ext}"
    await asyncio.to_thread(
        lambda: (dest_path.parent.mkdir(parents=True, exist_ok=True), dest_path.write_bytes(content))
    )

    task = ImportTask(user_id=user.id, image_path=str(dest_path))
    db.add(task)
    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(process_image_import, task.id, str(dest_path), user.id)
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)
