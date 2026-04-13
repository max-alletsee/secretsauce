# backend/app/schemas/admin.py
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    is_active: bool
    is_superuser: bool
    is_verified: bool
    preferred_units: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_superuser: bool | None = None


class UserStatsResponse(BaseModel):
    recipe_count: int
    meal_plan_count: int
    last_active: datetime | None  # max created_at across user's recipes and meal plans


class PaginatedAdminUsersResponse(BaseModel):
    items: list[AdminUserResponse]
    next_cursor: str | None
    has_more: bool


class AICallLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    call_type: str
    model: str
    prompt_summary: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    success: bool
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedAICallLogResponse(BaseModel):
    items: list[AICallLogResponse]
    next_cursor: str | None
    has_more: bool


class AdminAuditLogResponse(BaseModel):
    id: uuid.UUID
    admin_id: uuid.UUID
    admin_email: str
    action: str
    target_user_id: uuid.UUID | None
    target_email: str | None
    details: dict[str, Any]
    description: str
    created_at: datetime


class PaginatedAuditLogResponse(BaseModel):
    items: list[AdminAuditLogResponse]
    next_cursor: str | None
    has_more: bool


class AppLogEntry(BaseModel):
    timestamp: str
    level: str
    method: str
    path: str
    status_code: int
    latency_ms: int
    user_id: str | None


class AppLogsResponse(BaseModel):
    items: list[AppLogEntry]
