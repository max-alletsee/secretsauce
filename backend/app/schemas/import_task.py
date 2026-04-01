# backend/app/schemas/import_task.py
import uuid
from datetime import datetime

from pydantic import AnyHttpUrl, BaseModel, ConfigDict

from app.models.import_task import ImportTaskStatus


class RecipeImportURLRequest(BaseModel):
    url: AnyHttpUrl


class ImportTaskCreated(BaseModel):
    task_id: uuid.UUID
    status: ImportTaskStatus


class ImportTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ImportTaskStatus
    recipe_id: uuid.UUID | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
