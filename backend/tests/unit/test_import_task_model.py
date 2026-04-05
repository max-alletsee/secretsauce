# backend/tests/unit/test_import_task_model.py
import uuid

from app.models.import_task import ImportTask


def test_import_task_can_be_created_with_image_path_only():
    task = ImportTask(user_id=uuid.uuid4(), image_path="/tmp/uploads/abc.jpg")
    assert task.url is None
    assert task.image_path == "/tmp/uploads/abc.jpg"


def test_import_task_can_be_created_with_url_only():
    task = ImportTask(user_id=uuid.uuid4(), url="https://example.com/recipe")
    assert task.url == "https://example.com/recipe"
    assert task.image_path is None


def test_import_task_url_defaults_to_none():
    task = ImportTask(user_id=uuid.uuid4())
    assert task.url is None
