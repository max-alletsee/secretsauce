# backend/tests/unit/test_recipe_schemas.py
import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.recipe import (
    Ingredient,
    RecipeCreate,
    RecipeResponse,
    RecipeUpdate,
    RecipeVersionResponse,
    Step,
)


def _make_version_response(**overrides) -> RecipeVersionResponse:
    _now = datetime.now(timezone.utc)
    _uid = uuid.uuid4()
    defaults = dict(
        id=_uid,
        recipe_id=_uid,
        version_number=1,
        title="Test",
        description=None,
        ingredients=[],
        steps=[],
        servings=2,
        prep_time_minutes=None,
        waiting_time_minutes=None,
        cook_time_minutes=None,
        tags=[],
        recipe_source=None,
        created_at=_now,
    )
    defaults.update(overrides)
    return RecipeVersionResponse(**defaults)


def test_ingredient_requires_name():
    with pytest.raises(ValidationError):
        Ingredient(quantity="200")


def test_ingredient_unit_optional():
    i = Ingredient(name="salt", quantity="1 pinch")
    assert i.unit is None


def test_step_requires_order_and_instruction():
    with pytest.raises(ValidationError):
        Step(order=1)  # missing instruction


def test_recipe_create_requires_title():
    with pytest.raises(ValidationError):
        RecipeCreate(description="no title")


def test_recipe_create_title_cannot_be_empty():
    with pytest.raises(ValidationError):
        RecipeCreate(title="")


def test_recipe_create_defaults():
    r = RecipeCreate(title="Pasta")
    assert r.visibility == "private"
    assert r.ingredients == []
    assert r.steps == []
    assert r.servings == 2


def test_recipe_update_all_optional():
    u = RecipeUpdate()  # no fields required
    assert u.title is None


def test_recipe_update_servings_must_be_positive():
    with pytest.raises(ValidationError):
        RecipeUpdate(servings=0)


def test_recipe_version_response_total_time_minutes_computed():
    rv = _make_version_response(prep_time_minutes=10, waiting_time_minutes=5, cook_time_minutes=20)
    assert rv.total_time_minutes == 35  # 10 + 5 + 20


def test_recipe_version_response_total_time_minutes_none_when_all_times_none():
    rv = _make_version_response()
    assert rv.total_time_minutes is None


def test_recipe_response_has_current_version():
    _now = datetime.now(timezone.utc)
    _uid = uuid.uuid4()
    version = _make_version_response()
    r = RecipeResponse(
        id=_uid,
        owner_id=_uid,
        visibility="private",
        current_version=version,
        created_at=_now,
        updated_at=_now,
    )
    assert r.current_version.title == "Test"


def test_jsonb_dicts_coerce_to_ingredient_models():
    """JSONB data from Postgres comes back as plain dicts — Pydantic must coerce them."""
    rv = _make_version_response(
        ingredients=[{"name": "salt", "quantity": "1 tsp", "unit": None}],
        steps=[{"order": 1, "instruction": "Mix"}],
    )
    assert isinstance(rv.ingredients[0], Ingredient)
    assert rv.ingredients[0].name == "salt"
