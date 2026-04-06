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


from app.schemas.import_task import ImportTaskRead
from app.models.import_task import ImportTaskStatus
import uuid as uuid_mod


def test_from_orm_task_url_import():
    task = ImportTask(
        id=uuid_mod.uuid4(),
        user_id=uuid_mod.uuid4(),
        url="https://example.com/recipe",
        status=ImportTaskStatus.COMPLETED,
        recipe_id=uuid_mod.uuid4(),
    )
    result = ImportTaskRead.from_orm_task(task)
    assert result.import_type == "url"


def test_from_orm_task_image_import():
    task = ImportTask(
        id=uuid_mod.uuid4(),
        user_id=uuid_mod.uuid4(),
        image_path="/tmp/abc.jpg",
        status=ImportTaskStatus.PENDING,
    )
    result = ImportTaskRead.from_orm_task(task)
    assert result.import_type == "image"
