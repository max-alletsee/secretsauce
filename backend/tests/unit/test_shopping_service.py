# backend/tests/unit/test_shopping_service.py
"""Unit tests for pure helper functions in app.services.shopping.

These tests cover _scale_ingredients and _smart_merge_items — no database needed.
"""
import pytest

from app.schemas.ai_responses import ShoppingItemAIResult
from app.services.shopping import _scale_ingredients, _smart_merge_items


# ---------------------------------------------------------------------------
# _scale_ingredients
# ---------------------------------------------------------------------------

def _make_ingredient(name: str, quantity: str, unit: str = "g") -> dict:
    return {"name": name, "quantity": quantity, "unit": unit}


def test_scale_ingredients_scales_by_ratio():
    ingredients = [_make_ingredient("flour", "200")]
    result = _scale_ingredients(ingredients, entry_servings=2, recipe_servings=4)
    assert result[0]["scaled_qty"] == pytest.approx(100.0)


def test_scale_ingredients_same_servings_no_change():
    ingredients = [_make_ingredient("flour", "200")]
    result = _scale_ingredients(ingredients, entry_servings=4, recipe_servings=4)
    assert result[0]["scaled_qty"] == pytest.approx(200.0)


def test_scale_ingredients_zero_recipe_servings_no_scaling():
    ingredients = [_make_ingredient("flour", "200")]
    result = _scale_ingredients(ingredients, entry_servings=2, recipe_servings=0)
    assert result[0]["scaled_qty"] == pytest.approx(200.0)


def test_scale_ingredients_none_recipe_servings_no_scaling():
    ingredients = [_make_ingredient("flour", "200")]
    result = _scale_ingredients(ingredients, entry_servings=2, recipe_servings=None)
    assert result[0]["scaled_qty"] == pytest.approx(200.0)


def test_scale_ingredients_non_numeric_quantity_returns_zero():
    ingredients = [_make_ingredient("salt", "a pinch", unit="")]
    result = _scale_ingredients(ingredients, entry_servings=2, recipe_servings=4)
    assert result[0]["scaled_qty"] == pytest.approx(0.0)


def test_scale_ingredients_none_quantity_returns_zero():
    ingredients = [{"name": "salt", "quantity": None, "unit": ""}]
    result = _scale_ingredients(ingredients, entry_servings=2, recipe_servings=4)
    assert result[0]["scaled_qty"] == pytest.approx(0.0)


def test_scale_ingredients_preserves_original_fields():
    ingredients = [_make_ingredient("butter", "50", unit="g")]
    result = _scale_ingredients(ingredients, entry_servings=2, recipe_servings=2)
    assert result[0]["name"] == "butter"
    assert result[0]["unit"] == "g"


def test_scale_ingredients_multiple_items():
    ingredients = [
        _make_ingredient("flour", "200"),
        _make_ingredient("sugar", "100"),
    ]
    result = _scale_ingredients(ingredients, entry_servings=1, recipe_servings=4)
    assert result[0]["scaled_qty"] == pytest.approx(50.0)
    assert result[1]["scaled_qty"] == pytest.approx(25.0)


# ---------------------------------------------------------------------------
# _smart_merge_items
# ---------------------------------------------------------------------------

def _make_ai_item(
    name: str,
    qty: float = 100.0,
    unit: str = "g",
    detail: str = "100 g for Recipe",
    recipe_names: list[str] | None = None,
    category: str = "Basic Ingredients for Cooking and Baking",
) -> ShoppingItemAIResult:
    return ShoppingItemAIResult(
        ingredient_name=name,
        total_quantity=qty,
        unit=unit,
        detail=detail,
        recipe_names=recipe_names or ["Recipe"],
        category=category,
    )


def test_smart_merge_preserves_checked_for_matching_key():
    # Existing item "(flour, g)" was checked
    existing = {"(flour, g)": True}
    new_items = [_make_ai_item("Flour", unit="g")]
    result = _smart_merge_items(existing, new_items)
    assert result[0]["checked"] is True


def test_smart_merge_case_insensitive_key_matching():
    existing = {"(olive oil, ml)": True}
    new_items = [_make_ai_item("Olive Oil", unit="ML")]
    result = _smart_merge_items(existing, new_items)
    assert result[0]["checked"] is True


def test_smart_merge_new_item_is_unchecked():
    existing = {}
    new_items = [_make_ai_item("Tomatoes", unit="pcs", category="Fresh Fruits and Vegetables")]
    result = _smart_merge_items(existing, new_items)
    assert result[0]["checked"] is False


def test_smart_merge_removed_items_not_in_result():
    # "onion" was in old list but not in new AI result → not present
    existing = {"(onion, pcs)": True}
    new_items = []
    result = _smart_merge_items(existing, new_items)
    assert result == []


def test_smart_merge_carries_all_item_fields():
    existing = {}
    ai_item = _make_ai_item(
        "Eggs",
        qty=6.0,
        unit="pcs",
        detail="4 pcs for cake, 2 pcs for omelette",
        recipe_names=["Cake", "Omelette"],
        category="Cooled Products, Milk Products",
    )
    result = _smart_merge_items(existing, [ai_item])
    assert result[0]["ingredient_name"] == "Eggs"
    assert result[0]["total_quantity"] == 6.0
    assert result[0]["unit"] == "pcs"
    assert result[0]["detail"] == "4 pcs for cake, 2 pcs for omelette"
    assert result[0]["recipe_names"] == ["Cake", "Omelette"]
    assert result[0]["category"] == "Cooled Products, Milk Products"


def test_smart_merge_unchecked_existing_item_stays_unchecked():
    existing = {"(butter, g)": False}
    new_items = [_make_ai_item("Butter", unit="g")]
    result = _smart_merge_items(existing, new_items)
    assert result[0]["checked"] is False
