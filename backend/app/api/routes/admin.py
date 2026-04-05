# backend/app/api/routes/admin.py
import asyncio

from fastapi import APIRouter, Depends

from app.core.security import current_superuser
from app.models.user import User
from app.tasks.cleanup import cleanup_old_uploads

router = APIRouter()


@router.post("/cleanup")
async def trigger_cleanup(
    _user: User = Depends(current_superuser),
) -> dict:
    """Delete temp upload files older than 24 hours. Superuser only."""
    deleted_count = await asyncio.to_thread(cleanup_old_uploads)
    return {"deleted_count": deleted_count}
