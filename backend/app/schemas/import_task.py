# backend/app/schemas/import_task.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Literal

import pydantic
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field

from app.models.import_task import ImportTaskStatus

if TYPE_CHECKING:
    from app.models.import_task import ImportTask


class RecipeImportURLRequest(BaseModel):
    url: AnyHttpUrl


class RecipeGenerateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)

    @pydantic.field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title must not be empty")
        return v.strip()


class ImportTaskCreated(BaseModel):
    task_id: uuid.UUID
    status: ImportTaskStatus


class ImportTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ImportTaskStatus
    recipe_id: uuid.UUID | None
    error_message: str | None
    import_type: Literal["url", "image", "meal_suggestions", "recipe_generate"]
    result_data: dict | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_task(cls, task: ImportTask) -> ImportTaskRead:
        if task.task_type == "meal_suggestions":
            import_type: Literal["url", "image", "meal_suggestions", "recipe_generate"] = "meal_suggestions"
        elif task.task_type == "recipe_generate":
            import_type = "recipe_generate"
        elif task.image_path is not None:
            import_type = "image"
        else:
            import_type = "url"
        return cls(
            id=task.id,
            status=task.status,
            recipe_id=task.recipe_id,
            error_message=task.error_message,
            import_type=import_type,
            result_data=task.result_data,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
