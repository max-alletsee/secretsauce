# Shopping List Module — Design Spec

**Date:** 2026-04-09
**Phase:** 7 (Task #15)
**Status:** Approved

---

## Overview

Generate and manage a shopping list from a meal plan's entries. The list is persisted in the database, grouped by supermarket section, and regenerated on user demand via an AI call that normalizes ingredients, catches near-duplicates, and assigns each item to a supermarket category.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Persistence | Persist in DB | Preserves checked-off state between sessions |
| Regeneration trigger | Explicit button + dedicated endpoint | User controls when the list updates |
| Ingredient aggregation | LLM-powered | Catches near-duplicates (e.g. "plain flour" vs "all-purpose flour"); formats breakdown per recipe |
| Quantity scaling | entry.servings / recipe.servings | Accurate quantities for planned portion sizes |
| Display grouping | Supermarket sections (14 categories) | Ordered to match a logical shop traversal |
| Checked-state on regenerate | Smart merge by (ingredient_name, unit) | Preserves check progress; category may update |
| Mobile interaction | Tap/checkbox only | Large tap targets; no swipe gesture needed |

---

## Data Model

### `ShoppingList`
```
id              UUID PK
user_id         FK → users (indexed)
meal_plan_id    FK → meal_plans (UNIQUE — one list per plan)
name            str  (copied from meal plan name)
created_at      datetime (UTC)
updated_at      datetime (UTC)
```

### `ShoppingListItem`
```
id                  UUID PK
shopping_list_id    FK → shopping_lists (indexed)
ingredient_name     str  (AI-normalized, e.g. "flour")
total_quantity      float
unit                str  (AI-normalized)
detail              str  (AI-generated breakdown, e.g. "250 g for pizza, 150 g for pancakes")
category            str  (one of 14 supermarket categories — see below)
recipe_ids          JSONB array[UUID]  (source recipes for deep-linking)
checked             bool (default false)
created_at          datetime (UTC)
```

### Supermarket Categories (display order)
1. Fresh Fruits and Vegetables
2. Cooled Products, Milk Products
3. Tinned Products
4. Sauces, Herbs, Spices, Oils
5. Broth, sauces, readymade products
6. Baked products
7. Spreads for Bread
8. Deep-frozen products
9. Coffee and Tea
10. Cereals, Cornflakes, Müsli
11. Basic Ingredients for Cooking and Baking
12. Meat and Fish
13. Drinks
14. Sweets and Snacks

Categories with zero items are hidden in the UI.

---

## Backend

### New Files

#### `app/models/shopping_list.py`
- `ShoppingList` SQLModel table
- `ShoppingListItem` SQLModel table

#### Alembic migration
- Creates `shopping_lists` and `shopping_list_items` tables

#### `app/schemas/shopping_list.py`
```python
ShoppingListItemResponse   # all item fields
ShoppingListItemUpdate     # checked: bool only
ShoppingListResponse       # list fields + items: list[ShoppingListItemResponse]
```

#### `app/schemas/ai_responses.py` (additions)
```python
class ShoppingItemAIResult(BaseModel):
    ingredient_name: str
    total_quantity: float
    unit: str
    detail: str          # e.g. "250 g for pizza, 150 g for pancakes"
    recipe_names: list[str]
    category: Literal[<14 categories>]

class ShoppingListAIResult(BaseModel):
    items: list[ShoppingItemAIResult]
```

#### `app/services/shopping.py`

**`get_or_create_shopping_list(db, user_id, meal_plan_id) → ShoppingList`**
- Verify meal plan ownership (404 if not found or wrong user)
- Return existing ShoppingList if present, else create empty shell (no items) and return it

**`regenerate_shopping_list(db, user_id, meal_plan_id) → ShoppingList`**
1. Verify ownership; get or create ShoppingList shell
2. Fetch all `MealPlanEntry` rows for the plan where `recipe_id IS NOT NULL`
3. For each entry: load `recipe.current_version`, scale each ingredient:
   `scaled_qty = ingredient.quantity × (entry.servings / recipe_version.servings)`
   If `recipe_version.servings` is 0 or None: use quantity as-is
4. Build flat list: `{ingredient_name, scaled_qty, unit, recipe_name}` for all entries
5. Call Gemini with structured output (`ShoppingListAIResult`):
   - Prompt instructs: normalize names, merge near-duplicates, sum quantities, write `detail` breakdown per recipe, assign exactly one category from the canonical list
6. Resolve `recipe_names → recipe_ids` via name lookup from the loaded recipe versions
7. Smart merge:
   - Build dict of existing items keyed by `(ingredient_name.lower(), unit.lower())`
   - For each AI result item: if key matches existing item, carry forward `checked` state; otherwise `checked = False`
8. Delete all existing items for this list; bulk-insert new items; update `updated_at`
9. Return refreshed ShoppingList with items

**`toggle_item_checked(db, user_id, meal_plan_id, item_id, checked) → ShoppingListItem`**
- Resolve ShoppingList via meal_plan_id; verify list.user_id == user_id
- Set `item.checked = checked`, persist, return item

#### `app/api/routes/shopping_lists.py`

```
GET  /api/v1/shopping-lists/{meal_plan_id}
     → get_or_create_shopping_list()
     Response: ShoppingListResponse (items may be empty on first visit before regeneration)

POST /api/v1/shopping-lists/{meal_plan_id}/regenerate
     → regenerate_shopping_list()
     Response: ShoppingListResponse (with all items freshly generated)

PATCH /api/v1/shopping-lists/{meal_plan_id}/items/{item_id}
     Body: ShoppingListItemUpdate { checked: bool }
     → toggle_item_checked()
     Response: ShoppingListItemResponse
```

All routes require `current_active_user`. Router registered in `main.py` under `/api/v1`.

---

## Frontend

### New Files

#### `src/types/shoppingList.ts`
```typescript
interface ShoppingListItem {
  id: string
  ingredient_name: string
  total_quantity: number
  unit: string
  detail: string
  category: string
  recipe_ids: string[]
  checked: boolean
  created_at: string
}

interface ShoppingList {
  id: string
  meal_plan_id: string
  name: string
  items: ShoppingListItem[]
  created_at: string
  updated_at: string
}
```

#### `src/api/shoppingLists.ts`
```typescript
getShoppingList(mealPlanId: string)                            // GET
regenerateShoppingList(mealPlanId: string)                     // POST .../regenerate
toggleItem(mealPlanId, itemId, checked: boolean)               // PATCH .../items/{itemId}
```

#### `src/stores/useShoppingListStore.ts`
State: `list: ShoppingList | null`, `loading: boolean`, `regenerating: boolean`
Actions: `fetchList(mealPlanId)`, `regenerate(mealPlanId)`, `toggleItem(mealPlanId, itemId, checked)`

#### `src/views/ShoppingListView.vue`
Route: `/shopping-lists/:mealPlanId`

Layout:
- Header: plan name + "Regenerate" button (disabled + spinner while `regenerating`)
- On first load with empty list: prompt to generate ("No items yet — click Regenerate to build your shopping list")
- Items grouped by category in the canonical order above; empty categories hidden
- Each item row:
  - Large checkbox (min 48px tap target)
  - **ingredient_name** — total_quantity unit (bold)
  - `detail` string on second line in muted text (e.g. "250 g for pizza, 150 g for pancakes")
  - Checked items: struck through, sorted to bottom of their category group
- Mobile: full-width rows, comfortable vertical spacing

### Modified Files

#### `src/views/MealPlanDetailView.vue`
Add "Shopping list →" button alongside existing "Log meals" / "Confirm Plan" buttons.
Navigates to `{ name: 'shopping-list', params: { mealPlanId: planId } }`.

#### `src/router/index.ts`
```typescript
{
  path: '/shopping-lists/:mealPlanId',
  name: 'shopping-list',
  component: () => import('@/views/ShoppingListView.vue'),
  meta: { requiresAuth: true },
}
```

---

## Testing

### Backend — `tests/unit/test_shopping_service.py`
- Quantity scaling (normal, servings=0 edge case, servings=None edge case)
- Smart merge: checked items preserved when key matches; unchecked for new items; removed when key absent
- AI call mocked: verify prompt structure, correct parsing of `ShoppingListAIResult`
- Ownership: 404 when meal plan belongs to different user

### Frontend — `src/stores/useShoppingListStore.test.ts`
- `fetchList`: sets `list`, handles loading state
- `regenerate`: sets `regenerating`, updates `list` on success
- `toggleItem`: optimistic update pattern (or reactive on response)

---

## Out of Scope

- Manual item editing (add/remove/rename items by hand)
- Sharing or exporting the shopping list
- Per-store layout customization
- Unit conversion (grams ↔ cups)
