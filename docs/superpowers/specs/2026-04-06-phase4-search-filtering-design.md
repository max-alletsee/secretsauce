# Phase 4: Recipe Search & Filtering — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Full-text search and tag/sort filtering on the recipe list; backend query enhancements + frontend SearchBar, TagFilter, and SortControl components
**Blocked by:** Phase 2 (Recipe CRUD) — complete. Phase catch-up (TagFilter visual component) — must be merged before implementation if TagFilter already exists; otherwise Phase 4 creates it.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| search_vector maintenance | Application-maintained column | PostgreSQL generated columns don't support subqueries; service layer computes tsvector text in Python, covers title + description + ingredient names |
| Tag filter semantics | OR | Any selected tag matches; broader results, better for mobile browsing |
| Sort cursor strategy | Sort-aware cursor encoding `{sort_by, sort_value, id}` | Keeps cursor pagination consistent across all sort modes; mismatch returns 400 |
| Popularity sort | UI placeholder, always disabled | `MealPlanEntry` table doesn't exist until Phase 5; `popularity_sort_available` flag in response controls UI |
| Debounce strategy | Store watches `searchQuery` (300ms), immediate on tag/sort change | Search benefits from debounce; filter/sort changes are discrete selections |
| Unknown tags in query | Silently dropped | Consistent with the tag-filtering pattern in recipe import |

---

## Dependency Note

If the phase catch-up branch is merged before Phase 4 is implemented, `TagFilter.vue` already exists as a visual-only component with `defineModel<string[]>()`. Phase 4 then only needs to wire its model to the store — the component interface is identical. If not merged, Phase 4 creates `TagFilter.vue` in full.

---

## 1. Backend — Data Model

### 1a. `RecipeVersion` model (`app/models/recipe.py`)

Add one field:

```python
from sqlalchemy.dialects.postgresql import TSVECTOR

search_vector: str | None = Field(
    default=None,
    sa_column=Column(TSVECTOR(), nullable=True),
)
```

Add GIN index to `__table_args__`:

```python
Index("ix_recipe_versions_search_vector", "search_vector", postgresql_using="gin"),
```

### 1b. Alembic migration

Single migration: `add_search_vector_to_recipe_versions`

1. Add the `search_vector` column (nullable tsvector)
2. Create the GIN index
3. Backfill all existing rows:

```sql
UPDATE recipe_versions
SET search_vector = to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce((
        SELECT string_agg(elem->>'name', ' ')
        FROM jsonb_array_elements(ingredients) AS elem
    ), '')
)
```

The backfill uses raw SQL so the subquery over `ingredients` JSONB is available. Future writes go through the service layer.

---

## 2. Backend — Service (`app/services/recipe_service.py`)

### 2a. New helper: `_build_search_text`

```python
def _build_search_text(
    title: str,
    description: str | None,
    ingredients: list[dict],
) -> str:
    ingredient_names = ' '.join(i['name'] for i in ingredients if 'name' in i)
    return f"{title} {description or ''} {ingredient_names}".strip()
```

### 2b. Set `search_vector` on writes

In `create_recipe`, `update_recipe`, and `restore_version`, after constructing `new_version`:

```python
from sqlalchemy import func

new_version.search_vector = func.to_tsvector(
    'english',
    _build_search_text(new_version.title, new_version.description, new_version.ingredients),
)
```

### 2c. Updated `list_recipes` signature

```python
async def list_recipes(
    db: AsyncSession,
    current_user_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = 20,
    q: str | None = None,
    tags: list[str] | None = None,
    sort_by: str = "created_at_desc",
) -> tuple[list[tuple[Recipe, RecipeVersion]], str | None, bool]:
```

**Filtering applied in order:**

1. **Tag filter (OR)** — when `tags` is non-empty:
   ```python
   from sqlalchemy import cast, String
   from sqlalchemy.dialects.postgresql import ARRAY

   query = query.where(
       RecipeVersion.tags.op('?|')(cast(tags, ARRAY(String())))
   )
   ```

2. **Full-text search** — when `q` is non-empty after stripping:
   ```python
   query = query.where(
       RecipeVersion.search_vector.op('@@')(
           func.plainto_tsquery('english', q.strip())
       )
   )
   ```
   `plainto_tsquery` handles plain user input safely (no special syntax).

**Sort modes and keyset pagination:**

| `sort_by` | `ORDER BY` | Cursor `sort_value` |
|-----------|-----------|---------------------|
| `created_at_desc` (default) | `recipes.created_at DESC, recipes.id DESC` | `created_at` ISO string |
| `created_at_asc` | `recipes.created_at ASC, recipes.id ASC` | `created_at` ISO string |
| `title_asc` | `recipe_versions.title ASC, recipes.id ASC` | `title` string |
| `total_time_asc` | `coalesce(prep+wait+cook, 0) ASC, recipes.id ASC` | computed int |
| `popularity` | falls back to `created_at_desc` | `created_at` ISO string |

`total_time` is computed as:
```python
total_time = (
    func.coalesce(RecipeVersion.prep_time_minutes, 0) +
    func.coalesce(RecipeVersion.waiting_time_minutes, 0) +
    func.coalesce(RecipeVersion.cook_time_minutes, 0)
)
```

**Sort-aware cursor:**

`_encode_cursor(recipe, version, sort_by)` encodes `{sort_by, sort_value, id}`.

`_decode_cursor(cursor, sort_by)` decodes and validates that the cursor's `sort_by` matches the current request. Mismatch raises `HTTPException(400, detail="Cursor sort mismatch")`.

**Return value** extended to include the popularity flag:
```python
) -> tuple[list[tuple[Recipe, RecipeVersion]], str | None, bool, bool]:
    # items, next_cursor, has_more, popularity_available
```

`popularity_available` is always `False` until Phase 6.

---

## 3. Backend — Routes (`app/api/routes/recipes.py`)

### 3a. Updated `GET /api/v1/recipes`

New query parameters:

```python
q: str | None = Query(default=None, max_length=200)
tags: list[str] = Query(default=[])
sort_by: str = Query(default="created_at_desc")
```

Validation before calling the service:
- `sort_by` must be one of `{"created_at_desc", "created_at_asc", "title_asc", "total_time_asc", "popularity"}`. Invalid value → 400 with `error_code: "INVALID_SORT_BY"`.
- Unknown values in `tags` silently dropped (filter against `ALL_TAGS`).

### 3b. Updated `PaginatedRecipeResponse` schema

Add one field to `app/schemas/recipe.py`:

```python
class PaginatedRecipeResponse(BaseModel):
    items: list[RecipeResponse]
    next_cursor: str | None
    has_more: bool
    popularity_sort_available: bool = False
```

---

## 4. Frontend — New Components

### 4a. `SearchBar.vue` (`src/components/SearchBar.vue`)

- `defineModel<string>()` for the search value.
- Single `<input type="search">` styled to match the import input.
- Clear (×) button visible when value is non-empty; clicking it sets model to `''`.
- No internal debouncing — the parent manages timing.
- ARIA: `aria-label="Search recipes"`.

### 4b. `TagFilter.vue` (`src/components/TagFilter.vue`)

*(Create if not present from catch-up branch; wire if already present.)*

- `defineModel<string[]>()` for selected tags.
- Tag groups: Protein, Diet, Season, Meal type, Cuisine — matching `constants.py` categories.
- Each tag renders as a toggleable chip button. Selected state is visually distinct.
- "Clear all" button — visible when any tags are selected; sets model to `[]`.
- Mobile (< 768px): collapsed behind a "Filters (N)" toggle button showing active-filter count badge. Tapping expands/collapses the panel.
- Desktop (≥ 768px): always expanded, no toggle.

### 4c. `SortControl.vue` (`src/components/SortControl.vue`)

- Props: `modelValue: string`, `popularityAvailable: boolean`.
- Emits `update:modelValue`.
- Renders a `<select>` with options:

| Value | Label |
|-------|-------|
| `created_at_desc` | Newest first |
| `created_at_asc` | Oldest first |
| `title_asc` | Title A–Z |
| `total_time_asc` | Quickest |
| `popularity` | Most popular *(disabled when `!popularityAvailable`, title="Available after meal planning")* |

---

## 5. Frontend — Store & API

### 5a. `src/api/recipes.ts`

Update `getRecipes` signature:

```typescript
export const getRecipes = (params?: {
  cursor?: string
  limit?: number
  q?: string
  tags?: string[]
  sort_by?: string
}) => client.get<PaginatedResponse<Recipe>>('/recipes', { params })
```

axios serializes `tags: ['italian', 'dinner']` as `?tags=italian&tags=dinner`.

### 5b. `src/types/recipe.ts`

Add `popularity_sort_available: boolean` to `PaginatedResponse<T>` (or the recipe-specific paginated type).

### 5c. `src/stores/useRecipeStore.ts`

**New state:**
```typescript
const searchQuery = ref('')
const selectedTags = ref<string[]>([])
const sortBy = ref('created_at_desc')
const popularityAvailable = ref(false)
```

The route handler unpacks all four values:
```python
items, next_cursor, has_more, popularity_available = await recipe_service.list_recipes(...)
```

**Revised `fetchRecipes()`** — reset fetch (replaces existing list):
```typescript
async function fetchRecipes() {
  recipes.value = []
  nextCursor.value = null
  hasMore.value = true
  loading.value = true
  try {
    const { data } = await recipesApi.getRecipes({
      q: searchQuery.value || undefined,
      tags: selectedTags.value.length ? selectedTags.value : undefined,
      sort_by: sortBy.value,
    })
    recipes.value = data.items
    nextCursor.value = data.next_cursor
    hasMore.value = data.has_more
    popularityAvailable.value = data.popularity_sort_available
  } finally {
    loading.value = false
  }
}
```

**`loadMore()`** — passes search/filter/sort alongside cursor (unchanged shape):
```typescript
const { data } = await recipesApi.getRecipes({
  cursor: nextCursor.value ?? undefined,
  q: searchQuery.value || undefined,
  tags: selectedTags.value.length ? selectedTags.value : undefined,
  sort_by: sortBy.value,
})
```

**Watchers** (set up with `watch` inside the store):
```typescript
watch(searchQuery, debounce(fetchRecipes, 300))
watch([selectedTags, sortBy], fetchRecipes)
```

`debounce` is a small inline utility — no external library needed:
```typescript
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }) as T
}
```

**Exposed from store:** `searchQuery`, `selectedTags`, `sortBy`, `popularityAvailable` (all writable refs — `v-model` binds directly).

---

## 6. Frontend — `RecipeListView.vue`

Layout (top to bottom):

1. Header ("Recipes")
2. Import section (existing)
3. `<SearchBar v-model="recipeStore.searchQuery" />`
4. `<SortControl v-model="recipeStore.sortBy" :popularity-available="recipeStore.popularityAvailable" />`
5. `<TagFilter v-model="recipeStore.selectedTags" />`
6. Recipe grid / empty state / load more (existing)

No new local state. All search/filter/sort state lives in the store.

---

## 7. Testing

### Backend unit tests (`tests/unit/test_recipe_service.py`)

- `_build_search_text`: ingredient names extracted from JSONB list correctly
- `search_vector` set on `create_recipe` (includes title, description, ingredient names)
- `search_vector` updated on `update_recipe` and `restore_version`
- `list_recipes` with `q="chicken"`: matching recipes returned, non-matching excluded
- `list_recipes` with `tags=["italian", "dinner"]` OR semantics: recipes with either tag returned
- `list_recipes` with `sort_by="title_asc"`: alphabetical order
- `list_recipes` with `sort_by="total_time_asc"`: ordered by computed sum (nulls treated as 0)
- `list_recipes` with `sort_by="popularity"`: falls back to `created_at_desc`
- Cursor from `title_asc` passed with `sort_by="created_at_desc"`: raises 400

### Backend integration tests (`tests/integration/test_recipe_routes.py`)

- `GET /recipes?q=chicken` authenticated → filtered results
- `GET /recipes?tags=italian&tags=dinner` → OR semantics verified
- `GET /recipes?sort_by=invalid` → 400 with `INVALID_SORT_BY`
- `GET /recipes?tags=not-a-real-tag` → unknown tag dropped silently, no error
- `GET /recipes` unauthenticated → 401

### Frontend unit tests

- `SearchBar`: renders input, v-model updates, clear button appears/works
- `TagFilter`: chip toggles update model, clear-all resets to `[]`, count badge shows active count, collapses on mobile
- `SortControl`: popularity option has `disabled` attribute when `popularityAvailable=false`; emits correct value on change
- `useRecipeStore`: changing `selectedTags` calls `fetchRecipes` and resets cursor; `loadMore` passes current search params with cursor

---

## File Change Summary

### New files
- `frontend/src/components/SearchBar.vue`
- `frontend/src/components/SortControl.vue`
- `frontend/src/components/SearchBar.test.ts`
- `frontend/src/components/SortControl.test.ts`
- `backend/alembic/versions/xxxx_add_search_vector_to_recipe_versions.py`

### Modified files
- `backend/app/models/recipe.py` — add `search_vector` field + GIN index
- `backend/app/services/recipe_service.py` — `_build_search_text`, set `search_vector` on writes, updated `list_recipes`
- `backend/app/schemas/recipe.py` — add `popularity_sort_available` to `PaginatedRecipeResponse`
- `backend/app/api/routes/recipes.py` — add `q`, `tags`, `sort_by` params + validation
- `frontend/src/api/recipes.ts` — update `getRecipes` params
- `frontend/src/types/recipe.ts` — add `popularity_sort_available` to paginated type
- `frontend/src/stores/useRecipeStore.ts` — search/filter/sort state + watchers
- `frontend/src/views/RecipeListView.vue` — add SearchBar, SortControl, TagFilter
- `frontend/src/views/RecipeListView.test.ts` — add search/filter/sort tests
- `backend/tests/unit/test_recipe_service.py` — new search/filter/sort tests
- `backend/tests/integration/test_recipe_routes.py` — new search/filter/sort tests

### Conditionally new (if catch-up not merged)
- `frontend/src/components/TagFilter.vue`
- `frontend/src/components/TagFilter.test.ts`
