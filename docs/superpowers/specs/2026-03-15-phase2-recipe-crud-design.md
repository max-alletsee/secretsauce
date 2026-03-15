# Phase 2: Recipe CRUD & Versioning — Design Spec

**Date:** 2026-03-15
**Status:** Approved
**Scope:** Backend models, schemas, service, routes for Recipe CRUD with copy-on-write versioning (Task #7) + frontend views, components, store, and types (Task #8)
**Blocked by:** Phase 1 (auth & user management) — complete

---

## Design Decisions

These decisions were made during brainstorming and govern the implementation:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Shared visibility | Visible to all authenticated users (read-only) | Simplest model; target audience (friends/family) will all have accounts |
| Ingredient units | Constrained enum + free-text fallback | Normalizes common units for shopping list aggregation (Phase 7), allows freeform for edge cases |
| Tags | Pre-built only (31 tags across 5 categories) | Keeps filtering predictable; custom tags deferred |
| Cursor pagination | `(created_at DESC, id)` | Simple, stable; multi-sort deferred to Phase 4 (search) |
| Version restore | Creates new version copying old content | Keeps version history append-only and linear |
| Form editing pattern | Summary list + bottom drawer for ingredients/steps | Optimized for review-and-correct of AI-imported recipes (most common use case) |

---

## Data Model

### Recipe

Thin ownership record pointing to the current version.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `owner_id` | UUID (FK → User) | Recipe owner |
| `current_version_id` | UUID (FK → RecipeVersion), nullable | Set after first version is created |
| `visibility` | Enum: `private`, `shared` | Default `private` |
| `created_at` | datetime (UTC) | |
| `updated_at` | datetime (UTC) | Updated on every version change |

### RecipeVersion

All recipe content. Immutable once created — edits create new versions.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `recipe_id` | UUID (FK → Recipe) | Parent recipe |
| `version_number` | int | Auto-incremented per recipe, starting at 1 |
| `title` | str | Required |
| `description` | str, nullable | |
| `ingredients` | JSONB array | `[{name: str, quantity: float|null, unit: str|null}]` |
| `steps` | JSONB array | `[{order: int, instruction: str}]` |
| `servings` | int, nullable | |
| `prep_time_minutes` | int, nullable | |
| `waiting_time_minutes` | int, nullable | |
| `cook_time_minutes` | int, nullable | |
| `tags` | JSONB string array | Values from pre-built tag constants only |
| `recipe_source` | JSONB, nullable | `{type: "url"|"book", url?: str, book_title?: str, page?: int}` |
| `created_at` | datetime (UTC) | |
| `created_by` | UUID (FK → User) | Who created this version |

**Computed property (not stored):** `total_time_minutes` = sum of prep + waiting + cook (nulls treated as 0, returns null if all three are null).

### Unit Handling

A predefined list of common units is defined in `app/core/constants.py`:

```
g, kg, ml, l, cup, tbsp, tsp, oz, lb, piece, slice, bunch, clove, can, package, pinch, dash, whole
```

The `unit` field in ingredients is a **plain string**, not a DB enum. It accepts both predefined values and arbitrary freeform text (e.g., "large cloves", "handfuls"). Schema validation does **not** enforce the predefined list — the list is used by the frontend UI to offer a convenient dropdown, but any string is accepted. This keeps the backend flexible for AI imports that extract non-standard units. Shopping list aggregation (Phase 7) will match on exact string equality.

### Database Indexes

- `recipe.owner_id` — filter by owner
- `recipe_version.recipe_id` — join versions to recipe
- Compound index on `(recipe.created_at DESC, recipe.id)` — cursor pagination
- Compound index on `(recipe_version.recipe_id, recipe_version.version_number DESC)` — version listing

### Alembic Migration

Single migration creating both `recipe` and `recipe_version` tables with foreign keys and indexes.

---

## Backend

### Schemas (`app/schemas/recipe.py`)

**RecipeCreate:**
- `title` (str, required)
- `description` (str, optional)
- `ingredients` (list of `{name, quantity?, unit?}`, required, min 1 item)
- `steps` (list of `{order, instruction}`, required, min 1 item)
- `servings` (int, optional)
- `prep_time_minutes`, `waiting_time_minutes`, `cook_time_minutes` (int, optional)
- `tags` (list of str, optional, validated against pre-built constants)
- `recipe_source` (object, optional)
- `visibility` (enum, optional, default `private`)

**RecipeUpdate:**
- Same fields as RecipeCreate, all optional. Creates a full new version — fields not provided are carried forward from the current version. To explicitly clear an optional field, pass `null`; to keep the current value, omit the field entirely.

**RecipeRead:**
- `id`, `owner_id`, `visibility`, `created_at`, `updated_at`
- Current version fields flattened: `title`, `description`, `ingredients`, `steps`, `servings`, time fields, `total_time_minutes`, `tags`, `recipe_source`, `version_number`

**RecipeVersionRead:**
- `id`, `recipe_id`, `version_number`, all content fields, `total_time_minutes`, `created_at`, `created_by`, `created_by_display_name` (resolved server-side to avoid N+1 lookups on frontend)

**PaginatedResponse[T]:**
- `items: list[T]`
- `next_cursor: str | None`
- `has_more: bool`

### Service (`app/services/recipe_service.py`)

All functions receive `db: AsyncSession` and `user: User` as first arguments.

| Function | Behavior |
|----------|----------|
| `create_recipe(db, user, data)` | Create Recipe + RecipeVersion (version_number=1), set current_version_id, return RecipeRead |
| `get_recipe(db, user, recipe_id)` | Fetch with current version eagerly loaded. 404 if not found. 403 if private and not owner. |
| `update_recipe(db, user, recipe_id, data)` | Owner-only. Create new RecipeVersion (increment version_number), merge provided fields with current version for unset fields, update current_version_id and updated_at. |
| `delete_recipe(db, user, recipe_id)` | Owner-only. Delete Recipe (cascade deletes all versions). |
| `list_recipes(db, user, cursor)` | Return own recipes + others' shared recipes. Cursor-paginated by `(created_at DESC, id)`, page size 20. |
| `get_versions(db, user, recipe_id)` | Must have read access to recipe. Return all versions ordered by version_number DESC. No pagination — version count per recipe is expected to stay small (tens, not thousands). |
| `restore_version(db, user, recipe_id, version_id)` | Owner-only. Target version must belong to this recipe. Create new RecipeVersion copying target's content fields, increment version_number, update current_version_id. |

### Routes (`app/api/routes/recipes.py`)

All routes require `current_active_user` dependency.

| Method | Path | Status | Response |
|--------|------|--------|----------|
| `GET` | `/api/v1/recipes` | 200 | `PaginatedResponse[RecipeRead]` |
| `POST` | `/api/v1/recipes` | 201 | `RecipeRead` |
| `GET` | `/api/v1/recipes/{id}` | 200 | `RecipeRead` |
| `PUT` | `/api/v1/recipes/{id}` | 200 | `RecipeRead` |
| `DELETE` | `/api/v1/recipes/{id}` | 204 | (no body) |
| `GET` | `/api/v1/recipes/{id}/versions` | 200 | `list[RecipeVersionRead]` |
| `POST` | `/api/v1/recipes/{id}/versions/{version_id}/restore` | 200 | `RecipeRead` |

### Error Responses

| Error Code | HTTP Status | When |
|------------|-------------|------|
| `RECIPE_NOT_FOUND` | 404 | Recipe ID doesn't exist, **or** recipe is private and user is not the owner (avoids leaking existence) |
| `RECIPE_NOT_OWNER` | 403 | Write operation (update/delete/restore) on recipe not owned by user |
| `RECIPE_VERSION_NOT_FOUND` | 404 | Version ID doesn't exist or doesn't belong to recipe |
| `RECIPE_INVALID_TAGS` | 422 | Tags not in pre-built set |

**Security note:** When a non-owner tries to read a private recipe, return `RECIPE_NOT_FOUND` (404), not 403. This prevents leaking whether a recipe exists.

---

## Frontend

### Types (`src/types/recipe.ts`)

```typescript
interface Ingredient {
  name: string
  quantity: number | null
  unit: string | null
}

interface Step {
  order: number
  instruction: string
}

interface RecipeSource {
  type: 'url' | 'book'
  url?: string
  book_title?: string
  page?: number
}

interface Recipe {
  id: string
  owner_id: string
  visibility: 'private' | 'shared'
  created_at: string
  updated_at: string
  title: string
  description: string | null
  ingredients: Ingredient[]
  steps: Step[]
  servings: number | null
  prep_time_minutes: number | null
  waiting_time_minutes: number | null
  cook_time_minutes: number | null
  total_time_minutes: number | null
  tags: string[]
  recipe_source: RecipeSource | null
  version_number: number
}

interface RecipeVersion {
  id: string
  recipe_id: string
  version_number: number
  title: string
  description: string | null
  ingredients: Ingredient[]
  steps: Step[]
  servings: number | null
  prep_time_minutes: number | null
  waiting_time_minutes: number | null
  cook_time_minutes: number | null
  total_time_minutes: number | null
  tags: string[]
  recipe_source: RecipeSource | null
  created_at: string
  created_by: string
  created_by_display_name: string
}

interface PaginatedResponse<T> {
  items: T[]
  next_cursor: string | null
  has_more: boolean
}
```

### API (`src/api/recipes.ts`)

Typed functions using the shared axios client:

- `getRecipes(cursor?)` → `PaginatedResponse<Recipe>`
- `getRecipe(id)` → `Recipe`
- `createRecipe(data)` → `Recipe`
- `updateRecipe(id, data)` → `Recipe`
- `deleteRecipe(id)` → void
- `getVersions(id)` → `RecipeVersion[]`
- `restoreVersion(id, versionId)` → `Recipe`

### Store (`src/stores/useRecipeStore.ts`)

Pinia composition store:

**State:**
- `recipes: ref<Recipe[]>` — list view data
- `currentRecipe: ref<Recipe | null>` — detail/edit view
- `versions: ref<RecipeVersion[]>` — version history for current recipe
- `loading: ref<boolean>`
- `nextCursor: ref<string | null>`
- `hasMore: ref<boolean>`

**Actions:**
- `fetchRecipes()` — fresh load, resets cursor
- `loadMore()` — append next page
- `fetchRecipe(id)` — load single recipe into currentRecipe
- `createRecipe(data)` — POST, navigate to detail on success
- `updateRecipe(id, data)` — PUT, refresh currentRecipe
- `deleteRecipe(id)` — DELETE, remove from local list, navigate to list
- `fetchVersions(id)` — load version history
- `restoreVersion(id, versionId)` — POST restore, refresh currentRecipe and versions

### Views

**RecipeListView** (`/recipes`):
- Responsive grid: 1 col (phone), 2 col (tablet ≥768px), 3 col (desktop ≥1024px)
- Each recipe rendered as RecipeCard
- "Load more" button at bottom (visible when `hasMore` is true)
- Floating action button (bottom-right) → navigates to `/recipes/new`
- Shows own recipes + shared recipes from others

**RecipeDetailView** (`/recipes/:id`):
- Full recipe display: title, description, metadata bar (servings, total time, visibility badge)
- Ingredients list (read-only, formatted as "quantity unit name")
- Steps list (numbered)
- Tags as colored chips grouped by category
- Edit and Delete buttons — visible only when `recipe.owner_id === userStore.user.id`
- Collapsible version history panel at bottom: list of versions (number, date, author), "Restore" button per version
- **Error states:** 404 → "Recipe not found" message with link back to list. Loading failure → inline error with retry button.

**RecipeCreateView** (`/recipes/new`):
- Wraps RecipeForm with empty initial state
- On save: calls `createRecipe()`, navigates to `/recipes/:id`

**RecipeEditView** (`/recipes/:id/edit`):
- Wraps RecipeForm pre-populated from currentRecipe
- Redirects to detail view if user is not the owner
- On save: calls `updateRecipe()`, navigates to `/recipes/:id`
- **Error states:** 404 → redirect to recipe list. 403 → redirect to detail view (not owner).

### Components

**RecipeCard.vue:**
- Props: `recipe: Recipe`
- Displays: title, tag chips (max 3, "+N more"), total_time_minutes, servings
- Click navigates to `/recipes/:id`

**RecipeForm.vue:**
- Props: `initialData?: Partial<Recipe>`, `submitLabel: string`
- Emits: `submit(data)`, `cancel`
- Sections:
  - Title input, description textarea
  - Servings input, prep/waiting/cook time inputs
  - Ingredients summary list — each row shows "qty unit name", tap opens IngredientDrawer
  - "Add ingredient" button at bottom of list
  - Steps summary list — each row shows "step N: first 60 chars...", tap opens StepDrawer
  - "Add step" button at bottom of list
  - TagSelector (grouped toggle chips)
  - Visibility toggle (private/shared)
  - Submit and Cancel buttons
- **Validation:** Submit button disabled until title is non-empty, at least 1 ingredient, and at least 1 step. Inline error messages shown below invalid fields on submit attempt. Backend validation errors (422) mapped to field-level messages via `field_errors`.

**IngredientDrawer.vue:**
- Bottom drawer/sheet overlay
- Fields: name (text input), quantity (number input), unit (dropdown from enum + "other" freeform)
- "Save" and "Delete" buttons
- Emits: `save(ingredient)`, `delete`, `close`

**StepDrawer.vue:**
- Bottom drawer/sheet overlay
- Fields: instruction (textarea), step number display (read-only)
- "Save" and "Delete" buttons
- Emits: `save(step)`, `delete`, `close`

**TagSelector.vue:**
- Pre-built tags grouped by category header (Protein, Diet, Season, Meal Type, Cuisine)
- Each tag rendered as a toggle chip — active state highlighted
- Props: `modelValue: string[]`
- Emits: `update:modelValue`

**VersionHistoryPanel.vue:**
- Collapsible section (collapsed by default)
- List of RecipeVersion entries: version number, created_at formatted, created_by_display_name
- "Restore" button per version (not shown for current version)
- Emits: `restore(versionId)`

### Router Updates

Add to `src/router/index.ts`:

- `/recipes` → RecipeListView (meta: `requiresAuth`)
- `/recipes/new` → RecipeCreateView (meta: `requiresAuth`)
- `/recipes/:id` → RecipeDetailView (meta: `requiresAuth`)
- `/recipes/:id/edit` → RecipeEditView (meta: `requiresAuth`)

Note: `/recipes/new` must be defined **before** `/recipes/:id` to avoid the param route capturing "new".

---

## Testing

### Backend Unit Tests (`tests/unit/test_recipe_service.py`)

- **create_recipe** — creates Recipe + RecipeVersion, version_number=1, current_version_id set
- **update_recipe** — creates new version, increments version_number, updates current_version_id, carries forward unset fields
- **delete_recipe** — deletes recipe and all versions
- **restore_version** — creates new version copying target content, increments version_number
- **list_recipes** — returns own private + all shared, respects cursor pagination
- **visibility enforcement** — cannot read another user's private recipe (403)
- **ownership enforcement** — cannot update/delete another user's recipe (403)

### Backend Integration Tests (`tests/integration/test_recipe_routes.py`)

- Full CRUD cycle through HTTP (create → read → update → read → delete → verify 404)
- Pagination — create 25 recipes, fetch page 1 (20 items, has_more=true, cursor present), fetch page 2 (5 items, has_more=false)
- Version history — update twice, list versions, verify 3 versions exist with correct numbers
- Restore — restore version 1 from version 3, verify version 4 created with version 1's content
- Auth — unauthenticated requests → 401
- Ownership — user B cannot PUT/DELETE user A's recipe → 403
- Shared visibility — user B can GET user A's shared recipe, cannot GET user A's private recipe

### Frontend Store Tests (`src/stores/useRecipeStore.test.ts`)

- fetchRecipes — populates recipes, sets cursor/hasMore
- loadMore — appends to existing recipes, updates cursor
- createRecipe — calls API, returns created recipe
- updateRecipe — calls API, updates currentRecipe
- deleteRecipe — calls API, removes from local recipes list
- fetchVersions — populates versions list
- restoreVersion — calls API, updates currentRecipe

### Frontend Component Tests

Light touch — verify key behaviors:
- RecipeCard renders title, tags, times from props
- RecipeForm emits submit with correct data shape
- TagSelector toggles tags on click

---

## Out of Scope

The following are explicitly **not** part of Phase 2:

- Recipe import from URL/image (Phase 3)
- Full-text search and tag filtering on list endpoint (Phase 4)
- Sorting by title or total_time (Phase 4)
- Recipe images/thumbnails
- Recipe sharing via link (public/unauthenticated access)
- Custom user-created tags
- Unit conversion
