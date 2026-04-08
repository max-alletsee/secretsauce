# backend/app/models/import_task.py
import uuid
from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class ImportTaskStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportTask(SQLModel, table=True):
    __tablename__ = "import_tasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_import_tasks_user_id"),
            nullable=False,
            index=True,
        )
    )
    url: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    image_path: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    status: ImportTaskStatus = Field(
        default=ImportTaskStatus.PENDING,
        sa_column=Column(String(20), nullable=False, server_default="pending"),
    )
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_import_tasks_recipe_id"),
            nullable=True,
        ),
    )
    error_message: str | None = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    task_type: str = Field(
        default="recipe_import",
        sa_column=Column(String(30), nullable=False, server_default="recipe_import"),
    )
    result_data: dict | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    # NOTE: When using session.execute(update(...)) bulk statements, onupdate is NOT fired.
    # Always set updated_at explicitly in the service layer when using bulk UPDATE paths.
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            onupdate=lambda: datetime.now(timezone.utc),
        ),
    )
