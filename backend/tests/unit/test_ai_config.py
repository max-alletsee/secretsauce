# backend/tests/unit/test_ai_config.py
from app.core.ai_config import (
    MODEL_FLASH_LITE,
    MODEL_PRO,
    get_model,
)


def test_get_model_url_import_is_pro():
    assert get_model("url_import") == MODEL_PRO


def test_get_model_image_import_is_pro():
    assert get_model("image_import") == MODEL_PRO


def test_get_model_recipe_generate_is_pro():
    assert get_model("recipe_generate") == MODEL_PRO


def test_get_model_meal_suggestions_is_flash_lite():
    assert get_model("meal_suggestions") == MODEL_FLASH_LITE


def test_get_model_unknown_call_type_falls_back_to_flash_lite():
    assert get_model("some_future_task") == MODEL_FLASH_LITE
