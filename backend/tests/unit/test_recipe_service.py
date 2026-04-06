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
from app.models.recipe import Recipe


def _make_recipe(**kwargs) -> Recipe:
    defaults = dict(
        owner_id=uuid.uuid4(),
        visibility="private",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Recipe(**defaults)


def test_cursor_roundtrip():
    recipe = _make_recipe()
    cursor = _encode_cursor(recipe)
    decoded = _decode_cursor(cursor)
    assert decoded["id"] == recipe.id
    assert decoded["created_at"].tzinfo is not None  # timezone must survive round-trip for correct SQL comparisons
    assert decoded["created_at"].replace(tzinfo=None) == recipe.created_at.replace(tzinfo=None)


def test_decode_invalid_cursor_raises_400():
    with pytest.raises(HTTPException) as exc_info:
        _decode_cursor("not-valid-base64!!!")
    assert exc_info.value.status_code == 400


def test_decode_garbage_base64_raises_400():
    import base64
    bad = base64.urlsafe_b64encode(b"not json").decode()
    with pytest.raises(HTTPException) as exc_info:
        _decode_cursor(bad)
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
