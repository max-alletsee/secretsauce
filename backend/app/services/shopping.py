# backend/app/services/shopping.py
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal_plan import MealPlan, MealPlanEntry
from app.models.recipe import Recipe, RecipeVersion
from app.models.shopping_list import ShoppingList, ShoppingListItem
from app.schemas.ai_responses import ShoppingItemAIResult, ShoppingListAIResult

logger = logging.getLogger(__name__)

_SHOPPING_PROMPT = """\
You are a shopping list assistant. Given the following raw ingredient lines from a meal plan, your job is to:
1. Normalize ingredient names (e.g. "all-purpose flour" and "plain flour" → "flour")
2. Merge near-duplicate ingredients (same ingredient, different names or minor variations)
3. Sum quantities for merged ingredients
4. For each merged item, write a detail string showing the per-recipe breakdown
5. Assign each item to exactly one supermarket category from the list below

Raw ingredient lines (format: quantity unit ingredient_name — for recipe_name):
{raw_lines}

Supermarket categories — assign exactly one per item:
- Fresh Fruits and Vegetables
- Cooled Products, Milk Products
- Tinned Products
- Sauces, Herbs, Spices, Oils
- Broth, sauces, readymade products
- Baked products
- Spreads for Bread
- Deep-frozen products
- Coffee and Tea
- Cereals, Cornflakes, Müsli
- Basic Ingredients for Cooking and Baking
- Meat and Fish
- Drinks
- Sweets and Snacks

For the detail field, format as: "250 g for Pizza Dough, 150 g for Pancakes" \
(quantity unit for recipe_name, comma-separated).

Return a JSON object with an "items" array.\
"""


def _scale_ingredients(
    ingredients: list[dict],
    entry_servings: int,
    recipe_servings: int | None,
) -> list[dict]:
    """Return ingredients with a 'scaled_qty' (float) field added.

    Quantities are scaled by entry_servings / recipe_servings.
    Falls back to the raw numeric value (or 0.0 for non-numeric) when
    recipe_servings is 0 or None.
    """
    scale_up = recipe_servings is not None and recipe_servings > 0

    result = []
    for ing in ingredients:
        try:
            raw_qty = float(ing.get("quantity") or 0)
        except (ValueError, TypeError):
            raw_qty = 0.0

        scaled_qty = (raw_qty * entry_servings / recipe_servings) if scale_up else raw_qty
        result.append({**ing, "scaled_qty": scaled_qty})
    return result


def _build_ai_prompt(raw_lines: list[str]) -> str:
    return _SHOPPING_PROMPT.format(raw_lines="\n".join(raw_lines))


def _smart_merge_items(
    existing_checked: dict[str, bool],
    new_items: list[ShoppingItemAIResult],
) -> list[dict]:
    """Apply checked state from existing items to new AI result items.

    Key: "(ingredient_name.lower(), unit.lower())".
    Items whose key matches an existing checked item retain checked=True.
    All other new items start as checked=False.
    Items absent from new_items are not included (they were removed from the plan).
    """
    result = []
    for item in new_items:
        key = f"({item.ingredient_name.lower()}, {item.unit.lower()})"
        result.append(
            {
                "ingredient_name": item.ingredient_name,
                "total_quantity": item.total_quantity,
                "unit": item.unit,
                "detail": item.detail,
                "category": item.category,
                "recipe_names": item.recipe_names,
                "checked": existing_checked.get(key, False),
            }
        )
    return result


async def get_or_create_shopping_list(
    db: AsyncSession,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID,
) -> ShoppingList:
    """Return the existing ShoppingList for this plan, or create an empty shell."""
    plan = await db.get(MealPlan, meal_plan_id)
    if plan is None or plan.user_id != user_id:
        raise HTTPException(status_code=404, detail="Meal plan not found")

    result = await db.execute(
        select(ShoppingList).where(ShoppingList.meal_plan_id == meal_plan_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    shopping_list = ShoppingList(user_id=user_id, meal_plan_id=meal_plan_id, name=plan.name)
    db.add(shopping_list)
    await db.commit()
    await db.refresh(shopping_list)
    return shopping_list


async def regenerate_shopping_list(
    db: AsyncSession,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID,
) -> ShoppingList:
    """Regenerate items for the shopping list using Gemini.

    1. Fetch all MealPlanEntries with a recipe_id.
    2. Scale each recipe's ingredients by entry.servings / recipe.servings.
    3. Build raw ingredient lines and call Gemini for normalization/categorization.
    4. Smart-merge checked state from existing items.
    5. Replace all existing items with the new set.
    """
    from app.services import ai_service

    shopping_list = await get_or_create_shopping_list(db, user_id, meal_plan_id)

    # --- Collect raw ingredient lines ---
    entries_result = await db.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.meal_plan_id == meal_plan_id,
            MealPlanEntry.recipe_id.is_not(None),
        )
    )
    entries = list(entries_result.scalars().all())

    raw_lines: list[str] = []
    recipe_name_to_id: dict[str, uuid.UUID] = {}

    for entry in entries:
        recipe = await db.get(Recipe, entry.recipe_id)
        if recipe is None or recipe.current_version_id is None:
            continue
        version = await db.get(RecipeVersion, recipe.current_version_id)
        if version is None:
            continue

        recipe_name_to_id[version.title] = recipe.id
        scaled = _scale_ingredients(
            version.ingredients or [],
            entry_servings=entry.servings,
            recipe_servings=version.servings,
        )
        for ing in scaled:
            name = ing.get("name", "")
            unit = ing.get("unit") or ""
            qty = ing["scaled_qty"]
            raw_lines.append(f"{qty:.3g} {unit} {name} — for {version.title}")

    # --- Build existing checked-state map ---
    old_items_result = await db.execute(
        select(ShoppingListItem).where(ShoppingListItem.shopping_list_id == shopping_list.id)
    )
    existing_checked: dict[str, bool] = {
        f"({item.ingredient_name.lower()}, {item.unit.lower()})": item.checked
        for item in old_items_result.scalars().all()
    }

    # --- Call AI (skip if no entries have recipes) ---
    merged: list[dict] = []
    if raw_lines:
        prompt = _build_ai_prompt(raw_lines)
        ai_result = await ai_service.call_ai_structured(prompt, ShoppingListAIResult)
        merged = _smart_merge_items(existing_checked, ai_result.items)

    # --- Replace items ---
    old_to_delete_result = await db.execute(
        select(ShoppingListItem).where(ShoppingListItem.shopping_list_id == shopping_list.id)
    )
    for old in old_to_delete_result.scalars().all():
        await db.delete(old)

    for item_data in merged:
        recipe_ids = [
            str(recipe_name_to_id[name])
            for name in item_data["recipe_names"]
            if name in recipe_name_to_id
        ]
        db.add(
            ShoppingListItem(
                shopping_list_id=shopping_list.id,
                ingredient_name=item_data["ingredient_name"],
                total_quantity=item_data["total_quantity"],
                unit=item_data["unit"],
                detail=item_data["detail"],
                category=item_data["category"],
                recipe_ids=recipe_ids,
                checked=item_data["checked"],
            )
        )

    shopping_list.updated_at = datetime.now(timezone.utc)
    db.add(shopping_list)
    await db.commit()
    await db.refresh(shopping_list)
    return shopping_list


async def toggle_item_checked(
    db: AsyncSession,
    user_id: uuid.UUID,
    meal_plan_id: uuid.UUID,
    item_id: uuid.UUID,
    checked: bool,
) -> ShoppingListItem:
    """Toggle the checked state of a single shopping list item."""
    result = await db.execute(
        select(ShoppingList).where(ShoppingList.meal_plan_id == meal_plan_id)
    )
    shopping_list = result.scalar_one_or_none()
    if shopping_list is None or shopping_list.user_id != user_id:
        raise HTTPException(status_code=404, detail="Shopping list not found")

    item = await db.get(ShoppingListItem, item_id)
    if item is None or item.shopping_list_id != shopping_list.id:
        raise HTTPException(status_code=404, detail="Item not found")

    item.checked = checked
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item
