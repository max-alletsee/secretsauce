# backend/tests/unit/test_recipe_service.py
"""
Unit-style tests for recipe_service helper functions (cursor encoding, etc.)
These do not hit the database — they test pure logic.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.services.recipe_service import _build_search_text, _decode_cursor, _encode_cursor
from app.models.recipe import Recipe, RecipeVersion


def _make_recipe(**kwargs) -> Recipe:
    defaults = dict(
        owner_id=uuid.uuid4(),
        visibility="private",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Recipe(**defaults)


def _make_version(**kwargs) -> RecipeVersion:
    defaults = dict(
        recipe_id=uuid.uuid4(),
        version_number=1,
        title="Test Recipe",
        prep_time_minutes=10,
        waiting_time_minutes=0,
        cook_time_minutes=20,
    )
    defaults.update(kwargs)
    return RecipeVersion(**defaults)


def test_cursor_roundtrip():
    recipe = _make_recipe()
    version = _make_version(recipe_id=recipe.id)
    cursor = _encode_cursor(recipe, version, "created_at_desc")
    decoded = _decode_cursor(cursor, "created_at_desc")
    assert decoded["id"] == recipe.id
    assert decoded["sort_by"] == "created_at_desc"
    assert decoded["sort_value"].tzinfo is not None  # timezone must survive round-trip
    assert decoded["sort_value"].replace(tzinfo=None) == recipe.created_at.replace(tzinfo=None)


def test_cursor_roundtrip_title_asc():
    recipe = _make_recipe()
    version = _make_version(recipe_id=recipe.id, title="Apple Pie")
    cursor = _encode_cursor(recipe, version, "title_asc")
    decoded = _decode_cursor(cursor, "title_asc")
    assert decoded["id"] == recipe.id
    assert decoded["sort_value"] == "Apple Pie"


def test_cursor_roundtrip_total_time_asc():
    recipe = _make_recipe()
    version = _make_version(recipe_id=recipe.id, prep_time_minutes=5, cook_time_minutes=10, waiting_time_minutes=2)
    cursor = _encode_cursor(recipe, version, "total_time_asc")
    decoded = _decode_cursor(cursor, "total_time_asc")
    assert decoded["sort_value"] == 17


def test_cursor_sort_mismatch_raises_400():
    recipe = _make_recipe()
    version = _make_version(recipe_id=recipe.id)
    cursor = _encode_cursor(recipe, version, "created_at_desc")
    with pytest.raises(HTTPException) as exc_info:
        _decode_cursor(cursor, "title_asc")
    assert exc_info.value.status_code == 400


def test_decode_invalid_cursor_raises_400():
    with pytest.raises(HTTPException) as exc_info:
        _decode_cursor("not-valid-base64!!!", "created_at_desc")
    assert exc_info.value.status_code == 400


def test_decode_garbage_base64_raises_400():
    import base64
    bad = base64.urlsafe_b64encode(b"not json").decode()
    with pytest.raises(HTTPException) as exc_info:
        _decode_cursor(bad, "created_at_desc")
    assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# _build_search_text tests
# ---------------------------------------------------------------------------

def test_build_search_text_combines_title_description_and_ingredients():
    result = _build_search_text(
        title="Chicken Parmesan",
        description="A classic Italian dish",
        ingredients=[
            {"name": "chicken", "quantity": "2", "unit": "pieces"},
            {"name": "parmesan", "quantity": "100", "unit": "g"},
        ],
    )
    assert "Chicken Parmesan" in result
    assert "classic Italian dish" in result
    assert "chicken" in result
    assert "parmesan" in result


def test_build_search_text_handles_none_description():
    result = _build_search_text(
        title="Pasta",
        description=None,
        ingredients=[{"name": "spaghetti"}],
    )
    assert "Pasta" in result
    assert "spaghetti" in result


def test_build_search_text_handles_empty_ingredients():
    result = _build_search_text(title="Toast", description="Simple", ingredients=[])
    assert result == "Toast Simple"


def test_build_search_text_skips_ingredients_without_name_key():
    result = _build_search_text(
        title="Salad",
        description=None,
        ingredients=[{"quantity": "1"}, {"name": "lettuce"}],
    )
    assert "lettuce" in result
    assert "quantity" not in result


def test_build_search_text_no_double_space_when_description_is_none():
    result = _build_search_text(
        title="Eggs Benedict",
        description=None,
        ingredients=[{"name": "egg"}],
    )
    assert "  " not in result
