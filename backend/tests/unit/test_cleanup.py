# backend/tests/unit/test_cleanup.py
import os
import time
from pathlib import Path

import pytest

from app.tasks.cleanup import cleanup_old_uploads


def _touch(path: Path, age_seconds: int) -> None:
    """Create file and set its mtime to age_seconds in the past."""
    path.write_bytes(b"data")
    old_mtime = time.time() - age_seconds
    os.utime(path, (old_mtime, old_mtime))


def test_cleanup_deletes_files_older_than_24h(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.cleanup.settings.UPLOAD_DIR", str(tmp_path))
    old_file = tmp_path / "old.jpg"
    _touch(old_file, age_seconds=25 * 3600)  # 25 hours old

    deleted = cleanup_old_uploads()

    assert deleted == 1
    assert not old_file.exists()


def test_cleanup_keeps_recent_files(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.cleanup.settings.UPLOAD_DIR", str(tmp_path))
    recent_file = tmp_path / "recent.jpg"
    _touch(recent_file, age_seconds=3600)  # 1 hour old

    deleted = cleanup_old_uploads()

    assert deleted == 0
    assert recent_file.exists()


def test_cleanup_returns_correct_count(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.cleanup.settings.UPLOAD_DIR", str(tmp_path))
    for i in range(3):
        _touch(tmp_path / f"old_{i}.jpg", age_seconds=25 * 3600)
    _touch(tmp_path / "recent.jpg", age_seconds=3600)

    deleted = cleanup_old_uploads()

    assert deleted == 3


def test_cleanup_returns_zero_when_dir_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.tasks.cleanup.settings.UPLOAD_DIR",
        str(tmp_path / "nonexistent"),
    )
    deleted = cleanup_old_uploads()
    assert deleted == 0
