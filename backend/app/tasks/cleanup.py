# backend/app/tasks/cleanup.py
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

_MAX_AGE = timedelta(hours=24)


def cleanup_old_uploads() -> int:
    """Delete files in UPLOAD_DIR older than 24 hours. Returns count of deleted files."""
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.exists():
        return 0

    cutoff = datetime.now(timezone.utc) - _MAX_AGE
    deleted = 0

    for path in upload_dir.iterdir():
        if not path.is_file():
            continue
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff:
            try:
                path.unlink()
                deleted += 1
                logger.debug("Deleted old upload: %s", path)
            except OSError as exc:
                logger.warning("Failed to delete %s: %s", path, exc)

    if deleted:
        logger.info("Startup cleanup: deleted %d old upload file(s)", deleted)
    return deleted
