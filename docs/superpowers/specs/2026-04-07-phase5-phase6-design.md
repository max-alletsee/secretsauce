# Phase 5 & 6: Meal Planning + Logging — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Scope:**
- **Phase 5** — Meal plan creation (manual + AI-assisted), shortlist management, drag-and-drop planning UI
- **Phase 6** — Meal plan execution logging, carryover meal creation
**Blocked by:** Phase 4 (Search & Filtering) — complete.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI suggestion delivery | Async polling (202 + task_id) | Consistent with recipe import pattern; Gemini latency (5–15s) makes synchronous requests fragile |
| Suggestions persistence | Ephemeral (frontend state only) | Not stored in DB; regenerated each session |
| MealPlanEntry content | Nullable `recipe_id` + `note` + `entry_type` enum | Supports recipe, open suggestion, and free-text ("Restaurant X") in one table |
| Shortlist scope | Global persistent (own table, not tied to any plan) | Survives across planning sessions; acts as a standing "make it soon" backlog |
| Carryover eligibility | Recipe entries only | Free-text entries (e.g. "Restaurant X") have no recipe to carry over; silently skipped during logging |
| `ai_prompt_used` field | Write-once audit field on `MealPlan` | Captures the exact prompt snapshot (user prefs + steering + carryover context) for debugging and reproducibility |
| Task type reuse | Extend `ImportTask` table with `task_type` field | Reuses polling infrastructure from recipe import; avoids a new task table |
| Spec structure | Combined Phase 5 + 6 | Data models are tightly coupled; defining together avoids schema retrofits |

---

## 1. Data Model

All new tables and modifications land in a single Alembic migration.

### 1a. `User` model — new fields

```python
meal_plan_meal_types: list[str] = Field(
    default=["dinner"],
    sa_column=Column(JSONB, nullable=False, server_default='["dinner"]'),
)
meal_plan_days_ahead: int = Field(default=7)
```

Values for `meal_plan_meal_types` are drawn from the existing meal type constants: `breakfast`, `lunch`, `dinner`, `snack`.

### 1b. `MealPlan` model

```python
class MealPlan(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    name: str
    start_date: date
    end_date: date
    status: str = Field(default="draft")  # draft | active | completed
    ai_prompt_used: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

### 1c. `MealPlanEntry` model

Extended from CLAUDE.md to support three content types via nullable fields + `entry_type` discriminator.

```python
class MealPlanEntry(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    meal_plan_id: uuid.UUID = Field(foreign_key="mealplan.id", nullable=False, index=True)
    date: date
    meal_type: str  # breakfast | lunch | dinner | snack
    recipe_id: uuid.UUID | None = Field(default=None, foreign_key="recipe.id", nullable=True)
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entry_type: str = Field(default="recipe")  # recipe | suggestion | freetext
    servings: int = Field(default=2)
    source: str = Field(default="manual")  # ai_suggested | manual | carryover
    position: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

Constraint: `recipe_id` must be non-null when `entry_type == "recipe"`; `note` must be non-null when `entry_type` is `"suggestion"` or `"freetext"`.

### 1d. `ShortlistEntry` model *(new)*

Global persistent shortlist, one per user, independent of any meal plan.

```python
class ShortlistEntry(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    recipe_id: uuid.UUID | None = Field(default=None, foreign_key="recipe.id", nullable=True)
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entry_type: str = Field(default="recipe")  # recipe | suggestion
    position: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### 1e. `RecipeCookLog` model

As defined in CLAUDE.md — no changes.

```python
class RecipeCookLog(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    recipe_id: uuid.UUID = Field(foreign_key="recipe.id", nullable=False)
    meal_plan_id: uuid.UUID | None = Field(default=None, foreign_key="mealplan.id", nullable=True)
    cooked_at: date
    rating: int | None = Field(default=None)  # 1–5
    notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### 1f. `CarryoverMeal` model

As defined in CLAUDE.md — no changes.

```python
class CarryoverMeal(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    source_meal_plan_id: uuid.UUID = Field(foreign_key="mealplan.id", nullable=False)
    recipe_id: uuid.UUID = Field(foreign_key="recipe.id", nullable=False)
    original_date: date
    original_meal_type: str
    reason: str  # not_cooked | leftover
    target_meal_plan_id: uuid.UUID | None = Field(default=None, foreign_key="mealplan.id", nullable=True)
    resolved: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### 1g. `ImportTask` — add `task_type` field

```python
task_type: str = Field(default="recipe_import")  # recipe_import | meal_suggestions
```

Existing rows default to `"recipe_import"`. No other schema changes to `ImportTask`.

---

## 2. Backend — Services

### 2a. `app/services/meal_plan_service.py` *(new)*

```python
async def create_meal_plan(db, user_id, name, start_date, end_date) -> MealPlan
async def get_meal_plan(db, user_id, plan_id) -> MealPlan          # 404 if not found/not owned
async def list_meal_plans(db, user_id) -> list[MealPlan]           # ordered by created_at DESC
async def add_entry(db, user_id, plan_id, data) -> MealPlanEntry
async def update_entry(db, user_id, plan_id, entry_id, data) -> MealPlanEntry
async def delete_entry(db, user_id, plan_id, entry_id)
async def confirm_meal_plan(db, user_id, plan_id) -> MealPlan      # draft → active; 400 if not in draft status
```

### 2b. `app/services/shortlist_service.py` *(new)*

```python
async def get_shortlist(db, user_id) -> list[ShortlistEntry]       # ordered by position ASC
async def add_to_shortlist(db, user_id, recipe_id, note, entry_type) -> ShortlistEntry
async def remove_from_shortlist(db, user_id, entry_id)
async def reorder_shortlist(db, user_id, ordered_ids: list[uuid.UUID])
```

`reorder_shortlist` updates `position` for all provided IDs in a single transaction. IDs not in the list are left unchanged.

### 2c. `app/services/ai_service.py` — new function `generate_meal_suggestions`

**Input:**
```python
class SuggestionRequest(BaseModel):
    user: User                          # preferences, dietary flags, system prompt
    recipe_titles: list[tuple[uuid.UUID, str]]  # (id, title) pairs for collection matching
    steer_prompt: str | None            # optional steering text from user
    unresolved_carryovers: list[str]    # recipe titles; empty list in Phase 5
```

**Gemini prompt structure:**
1. System: user's `meal_plan_system_prompt` (if set), dietary restrictions, allergies, favourite cuisines, disliked ingredients
2. User: meal types to suggest for (`meal_plan_meal_types`), days ahead (`meal_plan_days_ahead`), full recipe title list from collection, steering prompt (if provided), carryover titles (if any)
3. Structured output: `list[MealSuggestion]` where each item has `title: str`, `matched_recipe_id: uuid.UUID | None`

**Collection matching:** The AI is instructed to use exact recipe titles from the provided list when suggesting collection recipes, and to return `null` for `matched_recipe_id` for open suggestions. The service validates returned IDs against the provided list; unrecognised IDs are nulled out.

**Task flow:** Identical to recipe import — creates an `ImportTask` row with `task_type="meal_suggestions"`, returns task_id, runs in `BackgroundTasks`, writes result as JSON to task on completion.

### 2d. `app/services/meal_log_service.py` *(new — Phase 6)*

```python
async def log_meal_plan(
    db,
    user_id,
    plan_id,
    entries: list[LogEntry],  # {entry_id, outcome: cooked|not_cooked|leftover}
) -> list[CarryoverMeal]
```

Logic:
1. Verify plan is `active` and owned by user; 400 otherwise
2. For each entry with `outcome == "cooked"` and `recipe_id` set: create `RecipeCookLog`
3. For each entry with `outcome in ("not_cooked", "leftover")` and `recipe_id` set: create `CarryoverMeal(resolved=False)`
4. Free-text / suggestion entries: skipped silently
5. Set plan `status = "completed"`
6. Return created `CarryoverMeal` rows

```python
async def get_unresolved_carryovers(db, user_id) -> list[CarryoverMeal]
```

Returns all `CarryoverMeal` rows where `user_id` matches and `resolved == False`, ordered by `created_at DESC`.

---

## 3. Backend — Routes (`app/api/routes/meal_plans.py`)

All routes require authentication. 404 is returned for any resource not owned by the authenticated user.

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/meal-plans` | 200 | List user's plans, most recent first |
| POST | `/meal-plans` | 201 | Create draft plan |
| GET | `/meal-plans/{id}` | 200 | Get plan + all entries |
| POST | `/meal-plans/{id}/entries` | 201 | Create a new entry (drop onto empty slot) |
| PATCH | `/meal-plans/{id}/entries/{entry_id}` | 200 | Update an existing entry (recipe, note, entry_type) |
| DELETE | `/meal-plans/{id}/entries/{entry_id}` | 204 | Clear a slot |
| POST | `/meal-plans/{id}/confirm` | 200 | Set status draft → active |
| POST | `/meal-plans/suggestions` | 202 | Trigger AI suggestions; returns `{task_id}` |
| GET | `/meal-plans/suggestions/{task_id}` | 200 | Poll; returns `{status, suggestions?}` |
| GET | `/shortlist` | 200 | Get user's shortlist |
| POST | `/shortlist` | 201 | Add entry to shortlist |
| DELETE | `/shortlist/{entry_id}` | 204 | Remove entry |
| PATCH | `/shortlist/reorder` | 200 | Reorder entries; body: `{ordered_ids: [...]}` |
| POST | `/meal-plans/{id}/log` | 200 | Log execution outcomes (Phase 6) |
| GET | `/meal-plans/carryovers` | 200 | Get unresolved carryovers (Phase 6) |

**`POST /meal-plans/suggestions` request body:**
```json
{
  "meal_plan_id": "optional — if provided, ai_prompt_used is written to this plan",
  "steer_prompt": "optional free text"
}
```

---

## 4. Frontend — Architecture

### 4a. Stores

**`src/stores/useMealPlanStore.ts`**

```typescript
// State
const plans = ref<MealPlan[]>([])
const currentPlan = ref<MealPlan | null>(null)
const currentEntries = ref<MealPlanEntry[]>([])
const suggestions = ref<MealSuggestion[]>([])   // ephemeral, not persisted
const suggestionLoading = ref(false)
const loading = ref(false)

// Actions
fetchPlans()
fetchPlan(id: string)
createPlan(data: MealPlanCreate)
updateEntry(planId: string, entryId: string, data: MealPlanEntryUpdate)
deleteEntry(planId: string, entryId: string)
confirmPlan(id: string)
generateSuggestions(steerPrompt?: string)  // triggers async polling via useImportPolling
```

**`src/stores/useShortlistStore.ts`**

```typescript
const entries = ref<ShortlistEntry[]>([])
const loading = ref(false)

fetchShortlist()
addEntry(data: ShortlistEntryCreate)
removeEntry(id: string)
reorder(orderedIds: string[])
```

### 4b. Routes & Views

| Route | View | Notes |
|-------|------|-------|
| `/meal-plans` | `MealPlanListView.vue` | List of plans with status badges; "New plan" CTA |
| `/meal-plans/new` | `MealPlanCreateView.vue` | Name + date range; creates draft, redirects to detail |
| `/meal-plans/:id` | `MealPlanDetailView.vue` | Three-panel planning UI |
| `/meal-plans/:id/log` | `MealPlanLogView.vue` | Per-entry outcome logging (Phase 6) |

### 4c. Components

| Component | Purpose |
|-----------|---------|
| `MealPlanCard.vue` | Plan summary card: name, date range, status badge, entry count |
| `MealSuggestionPanel.vue` | Top panel: suggestion chips + hidden steer field + Regen button |
| `MealSuggestionChip.vue` | Draggable chip; visually distinct for collection (📚) vs open suggestion (✨) with "→ recipe" affordance on open suggestions |
| `ShortlistPanel.vue` | Top-right panel: shortlist entries, drop zone, reorder handle |
| `MealPlanGrid.vue` | Vertical-days grid; owns drop zones, delegates slot rendering |
| `MealSlot.vue` | Single meal slot (one meal_type × one day); shows recipe/note/empty; tap on empty opens inline text input |
| `CarryoverBanner.vue` | Displayed at top of `MealPlanDetailView` when unresolved carryovers exist; lists them with "Add to shortlist" action (Phase 6) |

### 4d. Drag-and-Drop

All drag sources and drop targets use `vuedraggable`. Three valid drag paths:

1. **Suggestion → meal slot:** `updateEntry(planId, slotId, {recipe_id, note, entry_type})`
2. **Suggestion → shortlist:** `addEntry({recipe_id, note, entry_type})`
3. **Shortlist → meal slot:** `updateEntry(...)` + `removeEntry(shortlistEntryId)`
4. **Shortlist reorder:** `reorder(orderedIds)`

Dropping onto an occupied slot replaces the existing entry (PATCH, not POST).

### 4e. Layout Summary

**Desktop:**
```
┌─────────────────────────────────┬────────────────┐
│  AI Suggestions                 │  Shortlist ★   │
│  [steer field hidden by default]│  (collapsible) │
│  chip  chip  chip  chip  chip   │  entry         │
│  chip  chip                     │  entry         │
│                        [Regen]  │  [drop zone]   │
└─────────────────────────────────┴────────────────┘
┌────────────────────────────────────────────────────┐
│  Week of Apr 7 — Lunch & Dinner      [✓ Confirm]  │
│  Mon   [LUNCH: Pasta al Pesto]  [DINNER: …]       │
│  Tue   [LUNCH: …]               [DINNER: ✨ Thai] │
│  Wed   [LUNCH: …]               [DINNER: Rest. X] │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

**Mobile (375px):**
- Suggestions: wrapping flex grid (multi-row, no horizontal scroll)
- Shortlist: collapsible horizontal scroll strip
- Plan: same vertical-day layout, full day names

### 4f. "Convert to recipe" affordance

Open suggestion chips (`entry_type == "suggestion"`) in a meal slot or shortlist show a small "→ recipe" button. Tapping navigates to `/recipes/new` with `title` pre-filled via router query param.

### 4g. Phase 6 — Log View (`MealPlanLogView.vue`)

Displays all entries for an active plan. Each entry has a three-state toggle:
- **Cooked** (default for recipe entries)
- **Not cooked**
- **Leftover** (made it but have leftovers to carry forward)

Free-text / suggestion entries show as read-only (cannot be logged). On submit, calls `POST /meal-plans/{id}/log`. On success, navigates back to plan detail and shows `CarryoverBanner` if any carryovers were created.

---

## 5. Types (`src/types/mealPlan.ts`)

```typescript
export interface MealPlan {
  id: string
  user_id: string
  name: string
  start_date: string         // ISO date
  end_date: string
  status: 'draft' | 'active' | 'completed'
  created_at: string
  updated_at: string
}

export interface MealPlanEntry {
  id: string
  meal_plan_id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipe_id: string | null
  note: string | null
  entry_type: 'recipe' | 'suggestion' | 'freetext'
  servings: number
  source: 'ai_suggested' | 'manual' | 'carryover'
  position: number
}

export interface MealSuggestion {
  title: string
  matched_recipe_id: string | null
  entry_type: 'recipe' | 'suggestion'
}

export interface ShortlistEntry {
  id: string
  user_id: string
  recipe_id: string | null
  note: string | null
  entry_type: 'recipe' | 'suggestion'
  position: number
  created_at: string
}

export interface CarryoverMeal {
  id: string
  recipe_id: string
  recipe_title: string       // denormalised for display
  original_date: string
  original_meal_type: string
  reason: 'not_cooked' | 'leftover'
  resolved: boolean
}
```

---

## 6. Testing

### Backend unit tests

**`tests/unit/test_meal_plan_service.py`**
- `create_meal_plan`: status is `draft`, correct date range stored
- `confirm_meal_plan`: status transitions to `active`; raises 400 if already active
- `update_entry`: recipe, freetext, and suggestion entry types all stored correctly

**`tests/unit/test_shortlist_service.py`**
- `add_to_shortlist`: recipe and suggestion entries both created correctly
- `reorder_shortlist`: positions updated for all provided IDs; unlisted IDs unchanged

**`tests/unit/test_meal_log_service.py`**
- Cooked recipe entries → `RecipeCookLog` rows created
- Not-cooked / leftover recipe entries → `CarryoverMeal` rows created with correct `reason`
- Free-text / suggestion entries silently skipped
- Plan status set to `completed`
- `get_unresolved_carryovers`: returns only unresolved rows for the requesting user

**`tests/unit/test_ai_service.py` (additions)**
- `generate_meal_suggestions`: returned `matched_recipe_id` validated against provided collection; unrecognised IDs nulled out

### Backend integration tests

**`tests/integration/test_meal_plan_routes.py`**
- `POST /meal-plans` → 201, draft status
- `POST /meal-plans/{id}/confirm` → 200, status active; 400 on double-confirm
- `POST /meal-plans/suggestions` → 202 + task_id; poll returns suggestions list
- `POST /meal-plans/{id}/entries` → 201 entry created; 404 for wrong plan/user
- `PATCH /meal-plans/{id}/entries/{entry_id}` → 200 slot updated; 404 for wrong plan/user
- `POST /meal-plans/{id}/log` → 200; `CarryoverMeal` and `RecipeCookLog` rows created
- All endpoints → 401 unauthenticated; 404 accessing another user's resources

**`tests/integration/test_shortlist_routes.py`**
- `POST /shortlist` → 201; `DELETE /shortlist/{id}` → 204
- `PATCH /shortlist/reorder` → 200; subsequent GET returns entries in new order

### Frontend unit tests (Vitest)

- `MealSuggestionPanel`: steer field hidden by default; revealed on "Steer…" click; emits correct drag payload for collection vs open suggestion
- `MealSlot`: renders recipe name / note / empty state correctly; click on empty opens inline text input
- `ShortlistPanel`: drop adds entry via store action; remove button calls `removeEntry`
- `useMealPlanStore`: `generateSuggestions` sets `suggestionLoading`, polls until complete, populates `suggestions`; `confirmPlan` hits correct endpoint
- `useShortlistStore`: `reorder` sends ordered IDs to API

### E2E tests (Playwright)

- Full meal planning flow: create plan → generate suggestions → drag suggestion to slot → type free-text in slot → confirm plan
- Shortlist: drag suggestion to shortlist → drag from shortlist to plan slot → "→ recipe" button navigates to new recipe form with title pre-filled
- Phase 6: log plan with mixed outcomes → carryover banner appears on plan detail

---

## 7. File Change Summary

### New files
- `backend/app/models/meal_plan.py` — MealPlan, MealPlanEntry, ShortlistEntry, RecipeCookLog, CarryoverMeal
- `backend/app/schemas/meal_plan.py` — request/response Pydantic models
- `backend/app/services/meal_plan_service.py`
- `backend/app/services/shortlist_service.py`
- `backend/app/services/meal_log_service.py`
- `backend/app/api/routes/meal_plans.py`
- `backend/alembic/versions/xxxx_phase5_meal_planning.py`
- `backend/tests/unit/test_meal_plan_service.py`
- `backend/tests/unit/test_shortlist_service.py`
- `backend/tests/unit/test_meal_log_service.py`
- `backend/tests/integration/test_meal_plan_routes.py`
- `backend/tests/integration/test_shortlist_routes.py`
- `frontend/src/stores/useMealPlanStore.ts`
- `frontend/src/stores/useShortlistStore.ts`
- `frontend/src/api/mealPlans.ts`
- `frontend/src/types/mealPlan.ts`
- `frontend/src/views/MealPlanListView.vue`
- `frontend/src/views/MealPlanCreateView.vue`
- `frontend/src/views/MealPlanDetailView.vue`
- `frontend/src/views/MealPlanLogView.vue`
- `frontend/src/components/MealPlanCard.vue`
- `frontend/src/components/MealSuggestionPanel.vue`
- `frontend/src/components/MealSuggestionChip.vue`
- `frontend/src/components/ShortlistPanel.vue`
- `frontend/src/components/MealPlanGrid.vue`
- `frontend/src/components/MealSlot.vue`
- `frontend/src/components/CarryoverBanner.vue`
- `frontend/src/stores/useMealPlanStore.test.ts`
- `frontend/src/stores/useShortlistStore.test.ts`
- `frontend/src/components/MealSuggestionPanel.test.ts`
- `frontend/src/components/MealSlot.test.ts`
- `frontend/src/components/ShortlistPanel.test.ts`
- `frontend/e2e/meal-plans.spec.ts`

### Modified files
- `backend/app/models/user.py` — add `meal_plan_meal_types`, `meal_plan_days_ahead`
- `backend/app/models/import_task.py` — add `task_type` field
- `backend/app/services/ai_service.py` — add `generate_meal_suggestions`
- `backend/app/main.py` — include meal_plans router
- `backend/tests/unit/test_ai_service.py` — add suggestion generation tests
- `frontend/src/router/index.ts` — add meal plan routes
