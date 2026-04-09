# Shopping List Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 7 (Task #15) — a persisted, AI-generated shopping list derived from a meal plan's entries, grouped by supermarket category, with on-demand regeneration and check-off support.

**Architecture:** One `ShoppingList` per meal plan (unique constraint). `POST /{meal_plan_id}/regenerate` calls Gemini to normalize/merge ingredients, assigns supermarket categories, then smart-merges checked state from existing items before replacing them. Frontend shows items grouped in a fixed supermarket traversal order.

**Tech stack:** FastAPI, SQLModel/asyncpg, Google Gemini (`call_ai_structured`), Vue 3 Composition API, Pinia, Vitest, pytest-asyncio.

**Design spec:** `docs/superpowers/specs/2026-04-09-shopping-list-design.md`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `backend/app/models/shopping_list.py` | **Create** | `ShoppingList` + `ShoppingListItem` SQLModel tables |
| `backend/alembic/versions/<hash>_add_shopping_lists.py` | **Generate** | Migration for the two new tables |
| `backend/app/schemas/ai_responses.py` | **Modify** | Add `ShoppingItemAIResult`, `ShoppingListAIResult` |
| `backend/app/schemas/shopping_list.py` | **Create** | `ShoppingListItemResponse`, `ShoppingListItemUpdate`, `ShoppingListResponse` |
| `backend/tests/unit/test_shopping_service.py` | **Create** | Unit tests for pure service helpers |
| `backend/app/services/shopping.py` | **Create** | `_scale_ingredients`, `_smart_merge_items`, `_build_ai_prompt`, `get_or_create_shopping_list`, `regenerate_shopping_list`, `toggle_item_checked` |
| `backend/app/api/routes/shopping_lists.py` | **Create** | GET / POST regenerate / PATCH item routes |
| `backend/app/main.py` | **Modify** | Register shopping list router |
| `backend/tests/conftest.py` | **Modify** | Add shopping_list model import so tables are created in test DB |
| `frontend/src/types/shoppingList.ts` | **Create** | `ShoppingListItem`, `ShoppingList` TypeScript interfaces |
| `frontend/src/api/shoppingLists.ts` | **Create** | `getShoppingList`, `regenerateShoppingList`, `toggleItem` |
| `frontend/src/stores/useShoppingListStore.test.ts` | **Create** | Vitest tests for the store |
| `frontend/src/stores/useShoppingListStore.ts` | **Create** | Pinia store: `list`, `loading`, `regenerating`, actions |
| `frontend/src/views/ShoppingListView.vue` | **Create** | Category-grouped checklist view |
| `frontend/src/router/index.ts` | **Modify** | Add `/shopping-lists/:mealPlanId` route |
| `frontend/src/views/MealPlanDetailView.vue` | **Modify** | Add "Shopping list →" button |

---

## Task 1: Backend models

**Files:**
- Create: `backend/app/models/shopping_list.py`

- [ ] **Step 1: Create the models file**

```python
# backend/app/models/shopping_list.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class ShoppingList(SQLModel, table=True):
    __tablename__ = "shopping_lists"
    __table_args__ = (
        UniqueConstraint("meal_plan_id", name="uq_shopping_lists_meal_plan_id"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_shopping_lists_user_id"),
            nullable=False,
            index=True,
        )
    )
    meal_plan_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_shopping_lists_meal_plan_id"),
            nullable=False,
        )
    )
    name: str = Field(sa_column=Column(String(255), nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class ShoppingListItem(SQLModel, table=True):
    __tablename__ = "shopping_list_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    shopping_list_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("shopping_lists.id", name="fk_shopping_list_items_list_id"),
            nullable=False,
            index=True,
        )
    )
    ingredient_name: str = Field(sa_column=Column(String(255), nullable=False))
    total_quantity: float = Field(sa_column=Column(Float, nullable=False))
    unit: str = Field(sa_column=Column(String(50), nullable=False))
    detail: str = Field(sa_column=Column(Text, nullable=False))
    category: str = Field(sa_column=Column(String(100), nullable=False))
    recipe_ids: list = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="'[]'::jsonb"),
    )
    checked: bool = Field(
        default=False,
        sa_column=Column(Boolean(), nullable=False, server_default="false"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
```

- [ ] **Step 2: Update conftest.py to register the new tables**

Open `backend/tests/conftest.py` and add this import alongside the existing model imports:

```python
from app.models import shopping_list as _shopping_list_models  # noqa: F401 — registers ShoppingList/ShoppingListItem in SQLModel.metadata
```

The import block in conftest.py should now read:

```python
from app.models import user as _user_models  # noqa: F401
from app.models import recipe as _recipe_models  # noqa: F401
from app.models import import_task as _import_task_models  # noqa: F401
from app.models import meal_plan as _meal_plan_models  # noqa: F401
from app.models import shopping_list as _shopping_list_models  # noqa: F401
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/shopping_list.py backend/tests/conftest.py
git commit -m "feat: add ShoppingList and ShoppingListItem models"
```

---

## Task 2: AI response schemas

**Files:**
- Modify: `backend/app/schemas/ai_responses.py`

- [ ] **Step 1: Add the shopping AI response models**

Append to the bottom of `backend/app/schemas/ai_responses.py`:

```python
class ShoppingItemAIResult(BaseModel):
    ingredient_name: str
    total_quantity: float
    unit: str
    detail: str  # e.g. "250 g for Pizza Dough, 150 g for Pancakes"
    recipe_names: list[str]
    category: Literal[
        "Fresh Fruits and Vegetables",
        "Cooled Products, Milk Products",
        "Tinned Products",
        "Sauces, Herbs, Spices, Oils",
        "Broth, sauces, readymade products",
        "Baked products",
        "Spreads for Bread",
        "Deep-frozen products",
        "Coffee and Tea",
        "Cereals, Cornflakes, Müsli",
        "Basic Ingredients for Cooking and Baking",
        "Meat and Fish",
        "Drinks",
        "Sweets and Snacks",
    ]


class ShoppingListAIResult(BaseModel):
    items: list[ShoppingItemAIResult]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/ai_responses.py
git commit -m "feat: add ShoppingItemAIResult and ShoppingListAIResult schemas"
```

---

## Task 3: Shopping list Pydantic schemas

**Files:**
- Create: `backend/app/schemas/shopping_list.py`

- [ ] **Step 1: Create schemas file**

```python
# backend/app/schemas/shopping_list.py
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ShoppingListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shopping_list_id: uuid.UUID
    ingredient_name: str
    total_quantity: float
    unit: str
    detail: str
    category: str
    recipe_ids: list[str]
    checked: bool
    created_at: datetime


class ShoppingListItemUpdate(BaseModel):
    checked: bool


class ShoppingListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    meal_plan_id: uuid.UUID
    name: str
    items: list[ShoppingListItemResponse] = []
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/shopping_list.py
git commit -m "feat: add shopping list Pydantic schemas"
```

---

## Task 4: Shopping service — write failing unit tests first

**Files:**
- Create: `backend/tests/unit/test_shopping_service.py`

- [ ] **Step 1: Write the unit tests**

```python
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
```

- [ ] **Step 2: Run the tests — they must fail (ImportError)**

```bash
cd backend
pytest tests/unit/test_shopping_service.py -v
```

Expected: `ImportError: cannot import name '_scale_ingredients' from 'app.services.shopping'` (file doesn't exist yet).

- [ ] **Step 3: Commit the failing tests**

```bash
git add backend/tests/unit/test_shopping_service.py
git commit -m "test: add failing unit tests for shopping service helpers"
```

---

## Task 5: Shopping service implementation

**Files:**
- Create: `backend/app/services/shopping.py`

- [ ] **Step 1: Create the service file**

```python
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
```

- [ ] **Step 2: Run the unit tests — they must pass**

```bash
cd backend
pytest tests/unit/test_shopping_service.py -v
```

Expected output: all 14 tests PASSED.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/shopping.py
git commit -m "feat: implement shopping service with scaling, smart-merge, and Gemini regeneration"
```

---

## Task 6: Alembic migration

**Files:**
- Generate: `backend/alembic/versions/<hash>_add_shopping_lists.py`

- [ ] **Step 1: Generate the migration**

```bash
cd backend
alembic revision --autogenerate -m "add_shopping_lists"
```

Expected: a new file appears in `backend/alembic/versions/` with `_add_shopping_lists` in the name.

- [ ] **Step 2: Review the generated migration**

Open the generated file and verify:
- `op.create_table("shopping_lists", ...)` creates all columns: `id`, `user_id`, `meal_plan_id`, `name`, `created_at`, `updated_at`
- `op.create_table("shopping_list_items", ...)` creates all columns including `recipe_ids` (JSONB) and `checked` (Boolean)
- `op.create_unique_constraint("uq_shopping_lists_meal_plan_id", "shopping_lists", ["meal_plan_id"])` is present
- Both FK constraints are present: `fk_shopping_lists_user_id`, `fk_shopping_lists_meal_plan_id`, `fk_shopping_list_items_list_id`

If `alembic` auto-generates something unexpected (e.g. duplicate columns or wrong types), fix the generated file manually before proceeding.

- [ ] **Step 3: Apply the migration**

```bash
alembic upgrade head
```

Expected: `Running upgrade ... -> <hash>, add_shopping_lists` — no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: migration for shopping_lists and shopping_list_items tables"
```

---

## Task 7: Shopping list routes

**Files:**
- Create: `backend/app/api/routes/shopping_lists.py`

- [ ] **Step 1: Create the routes file**

```python
# backend/app/api/routes/shopping_lists.py
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_active_user, get_db
from app.models.shopping_list import ShoppingList, ShoppingListItem
from app.models.user import User
from app.schemas.shopping_list import (
    ShoppingListItemResponse,
    ShoppingListItemUpdate,
    ShoppingListResponse,
)
from app.services import shopping as shopping_service

router = APIRouter()


async def _load_items(db: AsyncSession, list_id: uuid.UUID) -> list[ShoppingListItem]:
    result = await db.execute(
        select(ShoppingListItem).where(ShoppingListItem.shopping_list_id == list_id)
    )
    return list(result.scalars().all())


def _to_response(shopping_list: ShoppingList, items: list[ShoppingListItem]) -> ShoppingListResponse:
    return ShoppingListResponse(
        id=shopping_list.id,
        user_id=shopping_list.user_id,
        meal_plan_id=shopping_list.meal_plan_id,
        name=shopping_list.name,
        items=[ShoppingListItemResponse.model_validate(item) for item in items],
        created_at=shopping_list.created_at,
        updated_at=shopping_list.updated_at,
    )


@router.get("/{meal_plan_id}", response_model=ShoppingListResponse)
async def get_shopping_list(
    meal_plan_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    shopping_list = await shopping_service.get_or_create_shopping_list(db, user.id, meal_plan_id)
    items = await _load_items(db, shopping_list.id)
    return _to_response(shopping_list, items)


@router.post("/{meal_plan_id}/regenerate", response_model=ShoppingListResponse)
async def regenerate_shopping_list(
    meal_plan_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    shopping_list = await shopping_service.regenerate_shopping_list(db, user.id, meal_plan_id)
    items = await _load_items(db, shopping_list.id)
    return _to_response(shopping_list, items)


@router.patch("/{meal_plan_id}/items/{item_id}", response_model=ShoppingListItemResponse)
async def toggle_item(
    meal_plan_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ShoppingListItemUpdate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    item = await shopping_service.toggle_item_checked(db, user.id, meal_plan_id, item_id, body.checked)
    return ShoppingListItemResponse.model_validate(item)
```

- [ ] **Step 2: Register the router in main.py**

Open `backend/app/main.py` and add:

```python
from app.api.routes import shopping_lists as shopping_lists_routes
```

Then add after the last `include_router` call:

```python
app.include_router(shopping_lists_routes.router, prefix="/api/v1/shopping-lists", tags=["shopping-lists"])
```

- [ ] **Step 3: Start the dev server and smoke-test the endpoints**

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

In a separate terminal:

```bash
# Should return 401 (auth required — not 404/500)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/shopping-lists/00000000-0000-0000-0000-000000000000
```

Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/shopping_lists.py backend/app/main.py
git commit -m "feat: add shopping list routes and register router"
```

---

## Task 8: Frontend types and API client

**Files:**
- Create: `frontend/src/types/shoppingList.ts`
- Create: `frontend/src/api/shoppingLists.ts`

- [ ] **Step 1: Create types**

```typescript
// frontend/src/types/shoppingList.ts

export interface ShoppingListItem {
  id: string
  shopping_list_id: string
  ingredient_name: string
  total_quantity: number
  unit: string
  detail: string
  category: string
  recipe_ids: string[]
  checked: boolean
  created_at: string
}

export interface ShoppingList {
  id: string
  user_id: string
  meal_plan_id: string
  name: string
  items: ShoppingListItem[]
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Create API client**

```typescript
// frontend/src/api/shoppingLists.ts
import client from './client'
import type { ShoppingList, ShoppingListItem } from '@/types/shoppingList'

export const getShoppingList = (mealPlanId: string) =>
  client.get<ShoppingList>(`/shopping-lists/${mealPlanId}`)

export const regenerateShoppingList = (mealPlanId: string) =>
  client.post<ShoppingList>(`/shopping-lists/${mealPlanId}/regenerate`)

export const toggleItem = (mealPlanId: string, itemId: string, checked: boolean) =>
  client.patch<ShoppingListItem>(`/shopping-lists/${mealPlanId}/items/${itemId}`, { checked })
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/shoppingList.ts frontend/src/api/shoppingLists.ts
git commit -m "feat: add shopping list TypeScript types and API client"
```

---

## Task 9: Frontend store — write failing tests first

**Files:**
- Create: `frontend/src/stores/useShoppingListStore.test.ts`

- [ ] **Step 1: Write the store tests**

```typescript
// frontend/src/stores/useShoppingListStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

vi.mock('@/api/shoppingLists', () => ({
  getShoppingList: vi.fn(),
  regenerateShoppingList: vi.fn(),
  toggleItem: vi.fn(),
}))

import * as shoppingApi from '@/api/shoppingLists'
import { useShoppingListStore } from './useShoppingListStore'
import type { ShoppingList, ShoppingListItem } from '@/types/shoppingList'

const mockItem: ShoppingListItem = {
  id: 'i1',
  shopping_list_id: 'sl1',
  ingredient_name: 'flour',
  total_quantity: 200,
  unit: 'g',
  detail: '200 g for Pizza Dough',
  category: 'Basic Ingredients for Cooking and Baking',
  recipe_ids: ['r1'],
  checked: false,
  created_at: '2026-04-09T00:00:00Z',
}

const mockList: ShoppingList = {
  id: 'sl1',
  user_id: 'u1',
  meal_plan_id: 'mp1',
  name: 'Week Plan',
  items: [mockItem],
  created_at: '2026-04-09T00:00:00Z',
  updated_at: '2026-04-09T00:00:00Z',
}

describe('useShoppingListStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchList populates list', async () => {
    vi.mocked(shoppingApi.getShoppingList).mockResolvedValue(axiosOk(mockList))
    const store = useShoppingListStore()
    await store.fetchList('mp1')
    expect(store.list).toEqual(mockList)
  })

  it('fetchList sets and clears loading', async () => {
    vi.mocked(shoppingApi.getShoppingList).mockResolvedValue(axiosOk(mockList))
    const store = useShoppingListStore()
    const promise = store.fetchList('mp1')
    expect(store.loading).toBe(true)
    await promise
    expect(store.loading).toBe(false)
  })

  it('regenerate updates list', async () => {
    const updated: ShoppingList = { ...mockList, items: [] }
    vi.mocked(shoppingApi.regenerateShoppingList).mockResolvedValue(axiosOk(updated))
    const store = useShoppingListStore()
    store.list = mockList
    await store.regenerate('mp1')
    expect(store.list).toEqual(updated)
  })

  it('regenerate sets and clears regenerating flag', async () => {
    vi.mocked(shoppingApi.regenerateShoppingList).mockResolvedValue(axiosOk(mockList))
    const store = useShoppingListStore()
    const promise = store.regenerate('mp1')
    expect(store.regenerating).toBe(true)
    await promise
    expect(store.regenerating).toBe(false)
  })

  it('toggleItem updates the item in list', async () => {
    const updatedItem: ShoppingListItem = { ...mockItem, checked: true }
    vi.mocked(shoppingApi.toggleItem).mockResolvedValue(axiosOk(updatedItem))
    const store = useShoppingListStore()
    store.list = { ...mockList, items: [mockItem] }
    await store.toggleItem('mp1', 'i1', true)
    expect(store.list!.items[0].checked).toBe(true)
  })

  it('toggleItem does nothing if list is null', async () => {
    const updatedItem: ShoppingListItem = { ...mockItem, checked: true }
    vi.mocked(shoppingApi.toggleItem).mockResolvedValue(axiosOk(updatedItem))
    const store = useShoppingListStore()
    // list is null — should not throw
    await store.toggleItem('mp1', 'i1', true)
    expect(store.list).toBeNull()
  })
})
```

- [ ] **Step 2: Run — tests must fail**

```bash
cd frontend
npx vitest run src/stores/useShoppingListStore.test.ts
```

Expected: `Cannot find module './useShoppingListStore'` (file doesn't exist yet).

- [ ] **Step 3: Commit failing tests**

```bash
git add frontend/src/stores/useShoppingListStore.test.ts
git commit -m "test: add failing unit tests for useShoppingListStore"
```

---

## Task 10: Frontend store implementation

**Files:**
- Create: `frontend/src/stores/useShoppingListStore.ts`

- [ ] **Step 1: Implement the store**

```typescript
// frontend/src/stores/useShoppingListStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as shoppingApi from '@/api/shoppingLists'
import type { ShoppingList } from '@/types/shoppingList'

export const useShoppingListStore = defineStore('shoppingList', () => {
  const list = ref<ShoppingList | null>(null)
  const loading = ref(false)
  const regenerating = ref(false)

  async function fetchList(mealPlanId: string) {
    loading.value = true
    try {
      const { data } = await shoppingApi.getShoppingList(mealPlanId)
      list.value = data
    } finally {
      loading.value = false
    }
  }

  async function regenerate(mealPlanId: string) {
    regenerating.value = true
    try {
      const { data } = await shoppingApi.regenerateShoppingList(mealPlanId)
      list.value = data
    } finally {
      regenerating.value = false
    }
  }

  async function toggleItem(mealPlanId: string, itemId: string, checked: boolean) {
    const { data } = await shoppingApi.toggleItem(mealPlanId, itemId, checked)
    if (list.value) {
      const idx = list.value.items.findIndex((i) => i.id === itemId)
      if (idx >= 0) list.value.items[idx] = data
    }
  }

  return { list, loading, regenerating, fetchList, regenerate, toggleItem }
})
```

- [ ] **Step 2: Run tests — all must pass**

```bash
cd frontend
npx vitest run src/stores/useShoppingListStore.test.ts
```

Expected: 6 tests PASSED.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/useShoppingListStore.ts
git commit -m "feat: implement useShoppingListStore"
```

---

## Task 11: ShoppingListView

**Files:**
- Create: `frontend/src/views/ShoppingListView.vue`

- [ ] **Step 1: Create the view**

```vue
<!-- frontend/src/views/ShoppingListView.vue -->
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useShoppingListStore } from '@/stores/useShoppingListStore'

const CATEGORY_ORDER = [
  'Fresh Fruits and Vegetables',
  'Cooled Products, Milk Products',
  'Tinned Products',
  'Sauces, Herbs, Spices, Oils',
  'Broth, sauces, readymade products',
  'Baked products',
  'Spreads for Bread',
  'Deep-frozen products',
  'Coffee and Tea',
  'Cereals, Cornflakes, Müsli',
  'Basic Ingredients for Cooking and Baking',
  'Meat and Fish',
  'Drinks',
  'Sweets and Snacks',
] as const

const route = useRoute()
const store = useShoppingListStore()
const mealPlanId = route.params.mealPlanId as string

onMounted(() => store.fetchList(mealPlanId))

const groupedItems = computed(() => {
  if (!store.list) return []
  const byCategory: Record<string, typeof store.list.items> = {}
  for (const item of store.list.items) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }
  return CATEGORY_ORDER
    .filter((cat) => byCategory[cat]?.length)
    .map((cat) => ({
      category: cat,
      items: [...byCategory[cat]].sort((a, b) => {
        if (a.checked === b.checked) return 0
        return a.checked ? 1 : -1
      }),
    }))
})

async function handleToggle(itemId: string, currentChecked: boolean) {
  await store.toggleItem(mealPlanId, itemId, !currentChecked)
}

async function handleRegenerate() {
  await store.regenerate(mealPlanId)
}
</script>

<template>
  <div class="shopping-view">
    <div v-if="store.loading" class="loading">Loading…</div>

    <template v-else-if="store.list">
      <header class="shopping-header">
        <h1 class="plan-name">{{ store.list.name }}</h1>
        <button
          class="btn-regenerate"
          :disabled="store.regenerating"
          @click="handleRegenerate"
        >
          {{ store.regenerating ? 'Generating…' : 'Regenerate' }}
        </button>
      </header>

      <div v-if="store.list.items.length === 0 && !store.regenerating" class="empty-state">
        <p>No items yet. Click <strong>Regenerate</strong> to build your shopping list.</p>
      </div>

      <div v-else class="category-list">
        <section
          v-for="group in groupedItems"
          :key="group.category"
          class="category-section"
        >
          <h2 class="category-title">{{ group.category }}</h2>
          <ul class="item-list">
            <li
              v-for="item in group.items"
              :key="item.id"
              class="item-row"
              :class="{ 'item-checked': item.checked }"
            >
              <label class="item-label">
                <input
                  type="checkbox"
                  :checked="item.checked"
                  class="item-checkbox"
                  @change="handleToggle(item.id, item.checked)"
                />
                <span class="item-content">
                  <span class="item-name">
                    {{ item.ingredient_name }}
                    <span class="item-quantity">
                      {{ item.total_quantity % 1 === 0 ? item.total_quantity : item.total_quantity.toFixed(1) }}
                      {{ item.unit }}
                    </span>
                  </span>
                  <span v-if="item.detail" class="item-detail">{{ item.detail }}</span>
                </span>
              </label>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.shopping-view {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
}

.shopping-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.plan-name {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.btn-regenerate {
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
}

.btn-regenerate:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  color: #888;
  padding: 3rem 1rem;
}

.category-section {
  margin-bottom: 1.5rem;
}

.category-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #666;
  margin: 0 0 0.4rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #e0e0e0;
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item-row {
  border-bottom: 1px solid #f0f0f0;
}

.item-label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0;
  cursor: pointer;
  min-height: 48px;
}

.item-checkbox {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 2px;
  cursor: pointer;
  accent-color: #2ecc71;
}

.item-content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.item-name {
  font-size: 1rem;
  line-height: 1.4;
}

.item-quantity {
  font-weight: 600;
  margin-left: 0.4rem;
}

.item-detail {
  font-size: 0.8rem;
  color: #888;
}

.item-checked .item-name {
  text-decoration: line-through;
  color: #bbb;
}

.item-checked .item-detail {
  color: #ccc;
}

.loading {
  text-align: center;
  color: #888;
  padding: 2rem;
}

@media (min-width: 768px) {
  .shopping-view {
    padding: 1.5rem;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/ShoppingListView.vue
git commit -m "feat: add ShoppingListView with category grouping and regenerate button"
```

---

## Task 12: Wire up router and MealPlanDetailView link

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/views/MealPlanDetailView.vue`

- [ ] **Step 1: Add route to router**

In `frontend/src/router/index.ts`, add this route inside the `routes` array (after the `meal-plan-log` route):

```typescript
{
  path: '/shopping-lists/:mealPlanId',
  name: 'shopping-list',
  component: () => import('@/views/ShoppingListView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] **Step 2: Add "Shopping list →" button to MealPlanDetailView**

In `frontend/src/views/MealPlanDetailView.vue`, add a shopping list button to the `plan-actions` div. Currently it contains the "Log meals" and "Confirm Plan" buttons. Add the shopping list button alongside them — it should always be visible regardless of plan status:

Change the `plan-actions` section from:

```html
<div class="plan-actions">
  <button
    v-if="planStore.currentPlan.status === 'active'"
    class="btn-log"
    @click="router.push({ name: 'meal-plan-log', params: { id: planId } })"
  >
    📋 Log meals
  </button>
  <button
    v-if="planStore.currentPlan.status === 'draft'"
    class="btn-confirm"
    @click="handleConfirm"
  >
    ✓ Confirm Plan
  </button>
</div>
```

To:

```html
<div class="plan-actions">
  <button
    class="btn-shopping"
    @click="router.push({ name: 'shopping-list', params: { mealPlanId: planId } })"
  >
    🛒 Shopping list
  </button>
  <button
    v-if="planStore.currentPlan.status === 'active'"
    class="btn-log"
    @click="router.push({ name: 'meal-plan-log', params: { id: planId } })"
  >
    📋 Log meals
  </button>
  <button
    v-if="planStore.currentPlan.status === 'draft'"
    class="btn-confirm"
    @click="handleConfirm"
  >
    ✓ Confirm Plan
  </button>
</div>
```

Also add the `btn-shopping` style to the `<style scoped>` section of `MealPlanDetailView.vue`:

```css
.btn-shopping {
  background: #f0f0f0;
  color: #333;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
}
```

- [ ] **Step 3: Run frontend unit tests to confirm nothing is broken**

```bash
cd frontend
npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/views/MealPlanDetailView.vue
git commit -m "feat: add shopping list route and link from MealPlanDetailView"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend
pytest --cov=app --cov-report=term-missing
```

Expected: all tests pass, no errors related to shopping list models or imports.

- [ ] **Step 2: Run all frontend unit tests**

```bash
cd frontend
npm run test:unit
```

Expected: all tests pass including the 6 new `useShoppingListStore` tests.

- [ ] **Step 3: Type-check frontend**

```bash
cd frontend
npm run type-check
```

Expected: no TypeScript errors.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete Phase 7 shopping list module"
```

---

## Quick Reference

### Backend commands
```bash
cd backend
uvicorn app.main:app --reload --port 8000   # dev server
pytest --cov=app --cov-report=term-missing  # all tests
pytest tests/unit/test_shopping_service.py -v  # shopping service tests only
alembic upgrade head                         # apply migrations
```

### Frontend commands
```bash
cd frontend
npm run dev          # dev server
npm run test:unit    # all unit tests
npm run type-check   # TypeScript check
```

### Key API endpoints (all require Bearer token)
```
GET  /api/v1/shopping-lists/{meal_plan_id}             → ShoppingListResponse
POST /api/v1/shopping-lists/{meal_plan_id}/regenerate  → ShoppingListResponse
PATCH /api/v1/shopping-lists/{meal_plan_id}/items/{item_id}  → ShoppingListItemResponse
```
