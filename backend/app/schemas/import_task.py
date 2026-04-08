# backend/app/schemas/import_task.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict

from app.models.import_task import ImportTaskStatus

if TYPE_CHECKING:
    from app.models.import_task import ImportTask


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
    import_type: Literal["url", "image"]
    result_data: dict | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_task(cls, task: ImportTask) -> ImportTaskRead:
        return cls(
            id=task.id,
            status=task.status,
            recipe_id=task.recipe_id,
            error_message=task.error_message,
            import_type="image" if task.image_path is not None else "url",
            result_data=task.result_data,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
