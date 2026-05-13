# Meal Plan View Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five bugs in the meal plan view: drag-to-shortlist, recipe linking via drawer, "→ recipe" draft flow, "Show later" button, and recipe deletion FK crash.

**Architecture:** Backend changes remove auto-save from recipe generation and fix FK cleanup in recipe deletion. Frontend changes add a `RecipeDrawer` component, wire up drop-to-shortlist, make recipe titles clickable, and add the "Show later" button. All frontend event plumbing flows upward to `TimelineView` which owns all state.

**Tech Stack:** Python/FastAPI/SQLAlchemy (backend), Vue 3 Composition API/TypeScript/Pinia (frontend), native HTML5 drag-and-drop, Vitest (frontend unit tests), pytest/httpx (backend integration tests).

---

## File Map

### Created
- `frontend/src/components/RecipeDrawer.vue` — slide-in drawer showing a recipe (existing or draft)

### Modified
- `backend/app/services/recipe_service.py` — `delete_recipe`: nullify/delete FK references before deleting
- `backend/app/services/recipe_import_service.py` — `process_generate_task`: stop auto-saving recipe, store data only
- `backend/tests/integration/test_recipe_routes.py` — add FK-cascade delete test
- `backend/tests/unit/test_recipe_import_service.py` — update generate task test
- `frontend/src/types/dragItem.ts` — add `timeline-entry` variant
- `frontend/src/components/ShortlistPanel.vue` — add drop zone handlers + visual feedback
- `frontend/src/components/MealSlot.vue` — add dragstart on entry + open-recipe emit
- `frontend/src/components/MealPlanGrid.vue` — propagate `drag-start` and `open-recipe` events
- `frontend/src/components/MealSuggestionChip.vue` — add open-recipe emit + in-flight converting state
- `frontend/src/components/MealSuggestionPanel.vue` — propagate `open-recipe` event
- `frontend/src/stores/useTimelineStore.ts` — add `appendEntries` method
- `frontend/src/views/TimelineView.vue` — drawer state, `toDate` as ref, `loadLater`, all new event handlers

---

## Task 1: Fix recipe deletion FK crash (backend)

**Files:**
- Modify: `backend/app/services/recipe_service.py` (function `delete_recipe`, ~lines 331–345)
- Modify: `backend/tests/integration/test_recipe_routes.py` (add test after line 274)

- [ ] **Step 1: Write a failing integration test**

Add this test at the end of `backend/tests/integration/test_recipe_routes.py`:

```python
async def test_delete_recipe_with_timeline_entry(client):
    """Deleting a recipe that has a linked timeline entry must not return 500."""
    token = await _auth_token(client)
    # Create recipe
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Linked Recipe"},
        headers=_auth(token),
    )
    assert create.status_code == 201
    recipe_id = create.json()["id"]

    # Create a timeline entry referencing the recipe
    entry_r = await client.post(
        "/api/v1/timeline/entries",
        json={
            "date": "2026-06-01",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "entry_type": "recipe",
        },
        headers=_auth(token),
    )
    assert entry_r.status_code == 201

    # Delete the recipe — must succeed (no FK crash)
    r = await client.delete(f"/api/v1/recipes/{recipe_id}", headers=_auth(token))
    assert r.status_code == 204

    # The timeline entry must still exist but with recipe_id = null
    entry_id = entry_r.json()["id"]
    get_entry = await client.get(f"/api/v1/timeline/entries/{entry_id}", headers=_auth(token))
    assert get_entry.status_code == 200
    assert get_entry.json()["recipe_id"] is None
    assert get_entry.json()["entry_type"] == "freetext"
    assert get_entry.json()["note"] == "Linked Recipe"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/integration/test_recipe_routes.py::test_delete_recipe_with_timeline_entry -v
```

Expected: FAIL — either 500 (FK violation) or assertion error on entry state.

- [ ] **Step 3: Add GET timeline entry endpoint (needed for test assertion)**

The test GETs a single timeline entry. Add this route to `backend/app/api/routes/timeline.py` after the existing `create_timeline_entry` route:

```python
@router.get("/entries/{entry_id}", response_model=TimelineEntryResponse)
async def get_timeline_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> TimelineEntryResponse:
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found")
    return TimelineEntryResponse.model_validate(entry)
```

- [ ] **Step 4: Fix `delete_recipe` in `backend/app/services/recipe_service.py`**

Add the following imports at the top of the file (after the existing imports, merge with existing `from sqlalchemy import ...` line):

```python
from sqlalchemy import cast, delete, func, select, String, update as sa_update
```

Replace the entire `delete_recipe` function (currently lines 331–345) with:

```python
async def delete_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> None:
    """Delete a recipe and all its versions. Owner only.

    Before deleting, cleans up all FK references in other tables so PostgreSQL
    does not raise a constraint violation.
    """
    from app.models.meal_plan import MealPlanEntry, ShortlistEntry, RecipeCookLog, CarryoverMeal

    recipe = await _get_recipe_as_owner(db, recipe_id, current_user_id)

    # Get the title for use as a fallback note in orphaned entries
    version_result = await db.execute(
        select(RecipeVersion).where(RecipeVersion.id == recipe.current_version_id)
    )
    current_version = version_result.scalar_one_or_none()
    recipe_title = current_version.title if current_version else str(recipe_id)

    # Nullify MealPlanEntry.recipe_id; preserve the slot as a freetext note
    await db.execute(
        sa_update(MealPlanEntry)
        .where(MealPlanEntry.recipe_id == recipe_id)
        .values(recipe_id=None, entry_type="freetext", note=recipe_title)
        .execution_options(synchronize_session=False)
    )

    # Nullify ShortlistEntry.recipe_id
    await db.execute(
        sa_update(ShortlistEntry)
        .where(ShortlistEntry.recipe_id == recipe_id)
        .values(recipe_id=None)
        .execution_options(synchronize_session=False)
    )

    # Delete RecipeCookLog rows (recipe_id is NOT NULL there)
    await db.execute(
        delete(RecipeCookLog).where(RecipeCookLog.recipe_id == recipe_id)
    )

    # Delete CarryoverMeal rows (recipe_id is NOT NULL there)
    await db.execute(
        delete(CarryoverMeal).where(CarryoverMeal.recipe_id == recipe_id)
    )

    # Nullify current_version_id first to break the circular FK before deleting versions
    recipe.current_version_id = None
    await db.flush()

    await db.execute(delete(RecipeVersion).where(RecipeVersion.recipe_id == recipe_id))
    await db.delete(recipe)
    await db.commit()
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && pytest tests/integration/test_recipe_routes.py::test_delete_recipe_with_timeline_entry -v
```

Expected: PASS

- [ ] **Step 6: Run full recipe route tests to check for regressions**

```bash
cd backend && pytest tests/integration/test_recipe_routes.py -v
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/services/recipe_service.py app/api/routes/timeline.py tests/integration/test_recipe_routes.py
git commit -m "fix: handle FK references when deleting a recipe"
```

---

## Task 2: Fix "→ recipe" generate flow — backend stops auto-saving (backend)

**Files:**
- Modify: `backend/app/services/recipe_import_service.py` (function `process_generate_task`, ~lines 94–161)
- Modify: `backend/tests/unit/test_recipe_import_service.py` (update existing generate test)

- [ ] **Step 1: Read the existing generate task test to understand what to update**

```bash
cd backend && grep -n "process_generate_task\|generate" tests/unit/test_recipe_import_service.py
```

- [ ] **Step 2: Update `process_generate_task` in `backend/app/services/recipe_import_service.py`**

Replace the entire `process_generate_task` function (lines 94–161) with this version that stores AI result data without creating a recipe:

```python
async def process_generate_task(task_id: uuid.UUID, title: str, user_id: uuid.UUID) -> None:
    """Background task: call Gemini to generate a recipe from a title.

    Stores the generated recipe data in result_data WITHOUT saving to the database.
    The frontend shows a draft preview; the user explicitly saves if they want it.
    Creates its own AsyncSession because BackgroundTasks run after the request session closes.
    """
    async with async_session_factory() as db:
        task = await db.get(ImportTask, task_id)
        if task is None:
            logger.error("process_generate_task: ImportTask %s not found — skipping", task_id)
            return

        task.status = ImportTaskStatus.PROCESSING
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)
        await db.commit()

        try:
            result: RecipeImportResult = await ai_service.generate_recipe_from_title(
                title, user_id=user_id, db=db
            )

            if not result.title:
                raise ValueError("Generated recipe has no title")
            if not result.ingredients:
                raise ValueError("Generated recipe has no ingredients")
            if not result.steps:
                raise ValueError("Generated recipe has no steps")

            filtered_tags = [t for t in (result.tags or []) if t in ALL_TAGS]

            # Store as a draft — no recipe_id, no DB recipe created.
            # The frontend reads result_data["recipe"] and shows a preview drawer.
            task.status = ImportTaskStatus.COMPLETED
            task.recipe_id = None
            task.result_data = {
                "recipe": {
                    "title": result.title,
                    "description": result.description,
                    "ingredients": [
                        {"name": i.name, "quantity": i.quantity, "unit": i.unit}
                        for i in result.ingredients
                    ],
                    "steps": [
                        {"order": s.order, "instruction": s.instruction}
                        for s in result.steps
                    ],
                    "servings": result.servings if result.servings is not None else 2,
                    "prep_time_minutes": result.prep_time_minutes,
                    "waiting_time_minutes": result.waiting_time_minutes,
                    "cook_time_minutes": result.cook_time_minutes,
                    "tags": filtered_tags,
                }
            }
            task.updated_at = datetime.now(timezone.utc)
            logger.info("process_generate_task: task %s completed (draft only)", task_id)

        except Exception as exc:
            logger.error("process_generate_task: task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)

        db.add(task)
        await db.commit()
```

- [ ] **Step 3: Update the unit test for `process_generate_task`**

In `backend/tests/unit/test_recipe_import_service.py`, find the test for `process_generate_task` (search for `process_generate_task`) and replace it with this version that asserts the recipe is NOT created but result_data IS set:

```python
@pytest.mark.asyncio
async def test_process_generate_task_stores_draft_without_saving():
    """process_generate_task must complete with result_data["recipe"] set but recipe_id=None."""
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    mock_task = MagicMock(spec=ImportTask)
    mock_task.id = task_id
    mock_task.status = ImportTaskStatus.PENDING

    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    ai_result = RecipeImportResult(
        title="Pizza Margherita",
        description="Classic Neapolitan pizza",
        ingredients=[ImportedIngredient(name="flour", quantity="300", unit="g")],
        steps=[ImportedStep(order=1, instruction="Mix dough")],
        servings=2,
        prep_time_minutes=20,
        waiting_time_minutes=60,
        cook_time_minutes=15,
        tags=["italian", "dinner"],
    )

    with (
        patch(
            "app.services.recipe_import_service.async_session_factory",
            return_value=mock_session_ctx,
        ),
        patch(
            "app.services.recipe_import_service.ai_service.generate_recipe_from_title",
            new=AsyncMock(return_value=ai_result),
        ),
    ):
        from app.services.recipe_import_service import process_generate_task
        await process_generate_task(task_id, "Pizza Margherita", user_id)

    assert mock_task.status == ImportTaskStatus.COMPLETED
    assert mock_task.recipe_id is None  # must NOT be set
    assert mock_task.result_data is not None
    assert mock_task.result_data["recipe"]["title"] == "Pizza Margherita"
    assert mock_task.result_data["recipe"]["tags"] == ["italian", "dinner"]
    assert len(mock_task.result_data["recipe"]["steps"]) == 1
```

- [ ] **Step 4: Run the unit test**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py -v -k "generate"
```

Expected: PASS

- [ ] **Step 5: Run the full generate route integration test**

```bash
cd backend && pytest tests/integration/test_recipe_generate_route.py -v
```

Expected: all pass (the route itself is unchanged)

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/services/recipe_import_service.py tests/unit/test_recipe_import_service.py
git commit -m "fix: generate recipe task stores draft data instead of auto-saving"
```

---

## Task 3: Add `appendEntries` to timeline store + "Show later" button (frontend)

**Files:**
- Modify: `frontend/src/stores/useTimelineStore.ts`
- Modify: `frontend/src/views/TimelineView.vue`

- [ ] **Step 1: Add `appendEntries` to `useTimelineStore`**

In `frontend/src/stores/useTimelineStore.ts`, add this function after `prependEntries` (after line 42):

```typescript
async function appendEntries(fromDate: string, toDate: string) {
  const { data } = await timelineApi.listEntries(fromDate, toDate)
  const existingIds = new Set(entries.value.map((e) => e.id))
  const newEntries = data.entries.filter((e) => !existingIds.has(e.id))
  entries.value = [...entries.value, ...newEntries]
}
```

Also add `appendEntries` to the return object at the bottom of the store (after `prependEntries,`):

```typescript
appendEntries,
```

- [ ] **Step 2: Write a unit test for `appendEntries`**

Create `frontend/src/stores/useTimelineStore.appendEntries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimelineStore } from './useTimelineStore'

vi.mock('@/api/timeline', () => ({
  listEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

import * as timelineApi from '@/api/timeline'

function makeEntry(id: string, date = '2026-06-10', mealType = 'dinner') {
  return {
    id,
    user_id: 'u1',
    meal_plan_id: null,
    date,
    meal_type: mealType,
    recipe_id: null,
    note: 'test',
    entry_type: 'freetext' as const,
    servings: 2,
    source: 'manual' as const,
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('useTimelineStore.appendEntries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('appends new entries without duplicates', async () => {
    const store = useTimelineStore()
    const existing = makeEntry('e1', '2026-06-10')
    store.entries = [existing]

    const fetched = [makeEntry('e1', '2026-06-10'), makeEntry('e2', '2026-06-17')]
    vi.mocked(timelineApi.listEntries).mockResolvedValueOnce({
      data: { entries: fetched },
    } as never)

    await store.appendEntries('2026-06-10', '2026-06-17')

    expect(store.entries).toHaveLength(2)
    expect(store.entries.map((e) => e.id)).toEqual(['e1', 'e2'])
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/stores/useTimelineStore.appendEntries.test.ts
```

Expected: PASS

- [ ] **Step 4: Add `loadLater` and convert `toDate` to ref in `TimelineView.vue`**

In `frontend/src/views/TimelineView.vue`:

Replace line 38–40:
```typescript
const toDate = computed(() =>
  addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7)
)
```
with:
```typescript
const toDate = ref(addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7))
```

Remove the `computed` import if it's no longer used elsewhere in the file (check: `computed` is still used for `mealTypes` and `recipeTitles`, so keep it).

Add the `loadLater` function after `loadEarlier` (after line 66):
```typescript
async function loadLater() {
  const newTo = addDays(toDate.value, 7)
  await timelineStore.appendEntries(toDate.value, newTo)
  toDate.value = newTo
}
```

- [ ] **Step 5: Add the "Show later" button to the template**

In `frontend/src/views/TimelineView.vue`, add the button after the closing `</MealPlanGrid>` tag (after line 175) and before the closing `</div>` of `.grid-section`:

```html
      <button class="show-later-btn" @click="loadLater">
        ↓ Show later
      </button>
```

Add the CSS for `.show-later-btn` in the `<style scoped>` section, after `.show-earlier-btn:hover`:

```css
.show-later-btn {
  display: block;
  width: 100%;
  padding: 0.35rem;
  margin-top: 0.5rem;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #9ca3af;
  cursor: pointer;
}
.show-later-btn:hover { background: #f3f4f6; color: #6b7280; }
```

- [ ] **Step 6: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/stores/useTimelineStore.ts src/stores/useTimelineStore.appendEntries.test.ts src/views/TimelineView.vue
git commit -m "feat: add Show Later button and appendEntries to timeline store"
```

---

## Task 4: Extend `DragItem` type and wire up drag-to-shortlist (frontend)

**Files:**
- Modify: `frontend/src/types/dragItem.ts`
- Modify: `frontend/src/components/ShortlistPanel.vue`
- Modify: `frontend/src/components/MealSlot.vue`
- Modify: `frontend/src/components/MealPlanGrid.vue`
- Modify: `frontend/src/views/TimelineView.vue`

- [ ] **Step 1: Extend `DragItem` type**

Replace the entire contents of `frontend/src/types/dragItem.ts` with:

```typescript
import type { MealSuggestion, ShortlistEntry } from '@/types/mealPlan'
import type { TimelineEntry } from '@/types/timeline'

export type DragItem =
  | { kind: 'suggestion'; suggestion: MealSuggestion }
  | { kind: 'shortlist'; entry: ShortlistEntry }
  | { kind: 'timeline-entry'; entry: TimelineEntry }
```

- [ ] **Step 2: Make `ShortlistPanel` a drop target**

Replace the entire `<script setup>` block in `frontend/src/components/ShortlistPanel.vue` with:

```typescript
<script setup lang="ts">
import { ref } from 'vue'
import type { ShortlistEntry } from '@/types/mealPlan'
import type { DragItem } from '@/types/dragItem'

defineProps<{ entries: ShortlistEntry[] }>()
const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'drag-start', item: DragItem): void
  (e: 'add-to-shortlist', item: DragItem): void
}>()

const dragOver = ref(false)

function onDragStart(event: DragEvent, entry: ShortlistEntry) {
  const item: DragItem = { kind: 'shortlist', entry }
  event.dataTransfer?.setData('application/json', JSON.stringify(item))
  emit('drag-start', item)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const item: DragItem = JSON.parse(raw)
    // Don't add shortlist-to-shortlist drops
    if (item.kind !== 'shortlist') {
      emit('add-to-shortlist', item)
    }
  } catch {
    // ignore malformed drag data
  }
}
</script>
```

In the template, update the `.drop-zone` div to:

```html
      <div
        class="drop-zone"
        :class="{ 'drop-zone--active': dragOver }"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        drop here to save for later
      </div>
```

Add the active state CSS in `<style scoped>` after `.drop-zone`:

```css
.drop-zone--active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #2563eb;
}
```

- [ ] **Step 3: Make `MealSlot` entries draggable**

In `frontend/src/components/MealSlot.vue`:

Add `drag-start` to the emits definition (after `drop-item`):
```typescript
  (e: 'drag-start', item: DragItem): void
```

Add this function before `onDragOver`:
```typescript
function onEntryDragStart(event: DragEvent) {
  if (!props.entry) return
  const item: DragItem = { kind: 'timeline-entry', entry: props.entry }
  event.dataTransfer?.setData('application/json', JSON.stringify(item))
  emit('drag-start', item)
}
```

On the recipe content span (line 85), change from:
```html
    <span v-else-if="entry && entry.entry_type === 'recipe'" class="slot-content recipe">
      {{ recipeTitle ?? entry.recipe_id }}
    </span>
```
to:
```html
    <span
      v-else-if="entry && entry.entry_type === 'recipe'"
      class="slot-content recipe"
      draggable="true"
      @dragstart.stop="onEntryDragStart"
    >
      {{ recipeTitle ?? entry.recipe_id }}
    </span>
```

Do the same for the suggestion span (line 88):
```html
    <span
      v-else-if="entry && entry.entry_type === 'suggestion'"
      class="slot-content suggestion"
      draggable="true"
      @dragstart.stop="onEntryDragStart"
    >
      ✨ {{ entry.note }}
    </span>
```

And the freetext span (line 91):
```html
    <span
      v-else-if="entry && entry.entry_type === 'freetext'"
      class="slot-content freetext"
      draggable="true"
      @dragstart.stop="onEntryDragStart"
    >
      {{ entry.note }}
    </span>
```

- [ ] **Step 4: Propagate `drag-start` through `MealPlanGrid`**

In `frontend/src/components/MealPlanGrid.vue`:

Add `drag-start` to the emits (after `drop-item`):
```typescript
  (e: 'drag-start', item: unknown): void
```

On the `<MealSlot>` component in the template, add:
```html
        @drag-start="(item) => emit('drag-start', item)"
```

- [ ] **Step 5: Handle `add-to-shortlist` in `TimelineView`**

In `frontend/src/views/TimelineView.vue`:

Add this handler function after `handleRemoveFromShortlist`:
```typescript
async function handleAddToShortlist(item: DragItem) {
  const drag = item as DragItem
  if (drag.kind === 'suggestion') {
    const s = drag.suggestion
    if (s.matched_recipe_id) {
      await shortlistStore.addEntry({ recipe_id: s.matched_recipe_id, entry_type: 'recipe', note: s.title })
    } else {
      await shortlistStore.addEntry({ recipe_id: null, entry_type: 'suggestion', note: s.title })
    }
  } else if (drag.kind === 'timeline-entry') {
    const entry = drag.entry
    if (entry.recipe_id) {
      await shortlistStore.addEntry({ recipe_id: entry.recipe_id, entry_type: 'recipe', note: entry.note ?? undefined })
    } else {
      await shortlistStore.addEntry({ recipe_id: null, entry_type: 'suggestion', note: entry.note ?? '' })
    }
  }
}
```

Add `@add-to-shortlist="handleAddToShortlist"` on the `<ShortlistPanel>` component in the template.

- [ ] **Step 6: Check shortlist store `addEntry` signature**

```bash
cd frontend && grep -n "addEntry" src/stores/useShortlistStore.ts
```

Confirm the `addEntry` method accepts `{ recipe_id, entry_type, note }`. If the type is different, adjust the calls in Step 5 to match.

- [ ] **Step 7: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/types/dragItem.ts src/components/ShortlistPanel.vue src/components/MealSlot.vue src/components/MealPlanGrid.vue src/views/TimelineView.vue
git commit -m "feat: drag-to-shortlist from suggestions and meal plan slots"
```

---

## Task 5: Build `RecipeDrawer` component (frontend)

**Files:**
- Create: `frontend/src/components/RecipeDrawer.vue`

- [ ] **Step 1: Create `RecipeDrawer.vue`**

Create `frontend/src/components/RecipeDrawer.vue` with this full implementation:

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import * as recipesApi from '@/api/recipes'
import { formatIngredient } from '@/composables/useFormatIngredient'
import type { Recipe, RecipeCreatePayload } from '@/types/recipe'
import type { RecipeVersionData } from '@/types/importTask'

const props = defineProps<{
  recipeId?: string
  draftRecipe?: RecipeVersionData
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', recipe: Recipe): void
}>()

const router = useRouter()
const userStore = useUserStore()
const recipeStore = useRecipeStore()

const fetchedRecipe = ref<Recipe | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)

const isOwner = computed(
  () => fetchedRecipe.value?.owner_id === userStore.user?.id
)

watch(
  () => props.recipeId,
  async (id) => {
    if (!id) return
    loading.value = true
    error.value = null
    fetchedRecipe.value = null
    try {
      const { data } = await recipesApi.getRecipe(id)
      fetchedRecipe.value = data
    } catch {
      error.value = 'Failed to load recipe.'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function saveToMyRecipes() {
  if (!props.draftRecipe) return
  saving.value = true
  try {
    const payload: RecipeCreatePayload = {
      title: props.draftRecipe.title,
      description: props.draftRecipe.description,
      ingredients: props.draftRecipe.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity ?? '',
        unit: i.unit,
      })),
      steps: props.draftRecipe.steps,
      servings: props.draftRecipe.servings,
      prep_time_minutes: props.draftRecipe.prep_time_minutes,
      waiting_time_minutes: props.draftRecipe.waiting_time_minutes,
      cook_time_minutes: props.draftRecipe.cook_time_minutes,
      tags: props.draftRecipe.tags,
      visibility: 'private',
    }
    const saved = await recipeStore.createRecipe(payload)
    emit('saved', saved)
    emit('close')
  } catch {
    error.value = 'Failed to save recipe. Please try again.'
  } finally {
    saving.value = false
  }
}

const version = computed(() => {
  if (props.draftRecipe) return props.draftRecipe
  return fetchedRecipe.value?.current_version ?? null
})

function totalTime(): number | null {
  if (!version.value) return null
  const prep = version.value.prep_time_minutes ?? 0
  const wait = version.value.waiting_time_minutes ?? 0
  const cook = version.value.cook_time_minutes ?? 0
  return prep + wait + cook || null
}
</script>

<template>
  <Teleport to="body">
    <div class="drawer-backdrop" @click="emit('close')" />
    <div class="recipe-drawer" role="dialog" aria-modal="true">
      <button class="drawer-close" aria-label="Close" @click="emit('close')">×</button>

      <!-- Draft banner -->
      <div v-if="draftRecipe" class="draft-banner">
        Draft — not yet saved
      </div>

      <!-- Loading / error states -->
      <div v-if="loading" class="drawer-loading">Loading…</div>
      <div v-else-if="error" class="drawer-error">
        {{ error }}
      </div>

      <!-- Recipe content -->
      <template v-else-if="version">
        <h2 class="drawer-title">{{ version.title }}</h2>

        <p v-if="version.description" class="drawer-description">{{ version.description }}</p>

        <div class="drawer-meta">
          <span v-if="version.servings">{{ version.servings }} servings</span>
          <span v-if="totalTime()">{{ totalTime() }} min total</span>
          <span v-if="version.prep_time_minutes">{{ version.prep_time_minutes }} min prep</span>
          <span v-if="version.cook_time_minutes">{{ version.cook_time_minutes }} min cook</span>
        </div>

        <section class="drawer-section">
          <h3>Ingredients</h3>
          <ul class="drawer-ingredients">
            <li v-for="(ing, i) in version.ingredients" :key="i">
              {{ formatIngredient(ing) }}
            </li>
          </ul>
        </section>

        <section class="drawer-section">
          <h3>Steps</h3>
          <ol class="drawer-steps">
            <li v-for="step in version.steps" :key="step.order">
              {{ step.instruction }}
            </li>
          </ol>
        </section>

        <section v-if="version.tags && version.tags.length" class="drawer-section">
          <div class="drawer-tags">
            <span v-for="tag in version.tags" :key="tag" class="drawer-tag">{{ tag }}</span>
          </div>
        </section>

        <!-- Draft actions -->
        <div v-if="draftRecipe" class="drawer-actions">
          <button class="btn btn--primary" :disabled="saving" @click="saveToMyRecipes">
            {{ saving ? 'Saving…' : 'Save to my recipes' }}
          </button>
          <button class="btn btn--secondary" @click="emit('close')">Dismiss</button>
        </div>

        <!-- Existing recipe actions -->
        <div v-else-if="isOwner && fetchedRecipe" class="drawer-actions">
          <RouterLink :to="`/recipes/${fetchedRecipe.id}/edit`" class="btn btn--secondary" @click="emit('close')">
            Edit recipe
          </RouterLink>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 199;
}
.recipe-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  height: 100dvh;
  background: #fff;
  z-index: 200;
  overflow-y: auto;
  padding: 1.5rem 1.25rem 2rem;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  animation: slide-in 0.2s ease;
}
@keyframes slide-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@media (max-width: 767px) {
  .recipe-drawer {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 85dvh;
    border-radius: 16px 16px 0 0;
    animation: slide-up 0.2s ease;
  }
  @keyframes slide-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
}
.drawer-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem;
}
.drawer-close:hover { color: #111; }
.draft-banner {
  background: #fef9c3;
  border: 1px solid #fde047;
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  color: #854d0e;
  margin-bottom: 1rem;
}
.drawer-loading, .drawer-error {
  text-align: center;
  padding: 2rem 0;
  color: #6b7280;
}
.drawer-error { color: #dc2626; }
.drawer-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 2rem 0.5rem 0;
  line-height: 1.3;
}
.drawer-description {
  color: #4b5563;
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}
.drawer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.8rem;
  color: #6b7280;
}
.drawer-section {
  margin: 1rem 0;
}
.drawer-section h3 {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin: 0 0 0.5rem;
}
.drawer-ingredients {
  list-style: disc inside;
  padding: 0;
  margin: 0;
  font-size: 0.9rem;
}
.drawer-ingredients li { padding: 0.2rem 0; }
.drawer-steps {
  padding-left: 1.25rem;
  margin: 0;
  font-size: 0.9rem;
}
.drawer-steps li { padding: 0.3rem 0; line-height: 1.5; }
.drawer-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.drawer-tag {
  padding: 0.2rem 0.6rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.75rem;
  color: #374151;
}
.drawer-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.btn--primary { background: #2563eb; color: #fff; }
.btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn--secondary { background: #f3f4f6; color: #374151; }
</style>
```

- [ ] **Step 2: Fix type mismatch for `formatIngredient`**

`formatIngredient` expects `Ingredient` from `@/types/recipe` where `quantity: string`. But `RecipeVersionData` has `quantity: string | null`. In `RecipeDrawer.vue`, wrap the call to handle this:

In the ingredients list template section, replace:
```html
            <li v-for="(ing, i) in version.ingredients" :key="i">
              {{ formatIngredient(ing) }}
            </li>
```
with:
```html
            <li v-for="(ing, i) in version.ingredients" :key="i">
              {{ formatIngredient({ name: ing.name, quantity: ing.quantity ?? '', unit: ing.unit }) }}
            </li>
```

- [ ] **Step 3: Run type-check to confirm no errors**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/RecipeDrawer.vue
git commit -m "feat: add RecipeDrawer component (existing + draft recipe modes)"
```

---

## Task 6: Wire recipe links into meal plan (open drawer on click) (frontend)

**Files:**
- Modify: `frontend/src/components/MealSlot.vue`
- Modify: `frontend/src/components/MealPlanGrid.vue`
- Modify: `frontend/src/components/MealSuggestionChip.vue`
- Modify: `frontend/src/components/MealSuggestionPanel.vue`
- Modify: `frontend/src/views/TimelineView.vue`

- [ ] **Step 1: Add `open-recipe` emit to `MealSlot`**

In `frontend/src/components/MealSlot.vue`, add to `defineEmits`:
```typescript
  (e: 'open-recipe', recipeId: string): void
```

On the recipe content span, add click handler (keep the existing `draggable` and `@dragstart` from Task 4):
```html
    <span
      v-else-if="entry && entry.entry_type === 'recipe'"
      class="slot-content recipe clickable"
      draggable="true"
      @dragstart.stop="onEntryDragStart"
      @click.stop="entry.recipe_id && emit('open-recipe', entry.recipe_id)"
    >
      {{ recipeTitle ?? entry.recipe_id }}
    </span>
```

Add CSS for `.clickable` in `<style scoped>`:
```css
.clickable { cursor: pointer; text-decoration: underline dotted; }
.clickable:hover { text-decoration: underline; }
```

- [ ] **Step 2: Propagate `open-recipe` through `MealPlanGrid`**

In `frontend/src/components/MealPlanGrid.vue`:

Add `open-recipe` to the emits (after `drag-start`):
```typescript
  (e: 'open-recipe', recipeId: string): void
```

On the `<MealSlot>` in the template, add:
```html
        @open-recipe="(id) => emit('open-recipe', id)"
```

- [ ] **Step 3: Add `open-recipe` emit to `MealSuggestionChip`**

In `frontend/src/components/MealSuggestionChip.vue`:

Add to `defineEmits`:
```typescript
  (e: 'open-recipe', recipeId: string): void
```

On the chip's outer div, add a click handler that fires only when the chip is a recipe type:
```html
  <div
    class="suggestion-chip"
    :class="suggestion.entry_type"
    :data-testid="`chip-${suggestion.entry_type}`"
    draggable="true"
    @dragstart="onDragStart"
    @click.stop="suggestion.entry_type === 'recipe' && suggestion.matched_recipe_id && emit('open-recipe', suggestion.matched_recipe_id)"
  >
```

- [ ] **Step 4: Propagate `open-recipe` through `MealSuggestionPanel`**

In `frontend/src/components/MealSuggestionPanel.vue`:

Add `open-recipe` to `defineEmits`:
```typescript
  (e: 'open-recipe', recipeId: string): void
```

On each `<MealSuggestionChip>`, add:
```html
        @open-recipe="(id) => emit('open-recipe', id)"
```

- [ ] **Step 5: Wire drawer state in `TimelineView`**

In `frontend/src/views/TimelineView.vue`:

Add imports:
```typescript
import RecipeDrawer from '@/components/RecipeDrawer.vue'
import type { Recipe } from '@/types/recipe'
import type { RecipeVersionData } from '@/types/importTask'
```

Add drawer state refs (after `convertError`):
```typescript
const drawerOpen = ref(false)
const drawerRecipeId = ref<string | null>(null)
const drawerDraftRecipe = ref<RecipeVersionData | null>(null)

function openRecipeDrawer(recipeId: string) {
  drawerDraftRecipe.value = null
  drawerRecipeId.value = recipeId
  drawerOpen.value = true
}

function openDraftDrawer(draft: RecipeVersionData) {
  drawerRecipeId.value = null
  drawerDraftRecipe.value = draft
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  drawerRecipeId.value = null
  drawerDraftRecipe.value = null
}

function handleDrawerSaved(_recipe: Recipe) {
  closeDrawer()
}
```

Update the `useImportPolling` callback to open draft drawer instead of navigating:
```typescript
const { startPolling } = useImportPolling((recipeId: string, _recipeData, resultData) => {
  convertingTitle.value = null
  if (resultData?.recipe) {
    openDraftDrawer(resultData.recipe as RecipeVersionData)
  } else if (recipeId) {
    openRecipeDrawer(recipeId)
  }
})
```

Add `convertingTitle` ref and update `handleConvertToRecipe` with the in-flight guard:
```typescript
const convertingTitle = ref<string | null>(null)

async function handleConvertToRecipe(title: string) {
  if (convertingTitle.value !== null) return
  convertingTitle.value = title
  convertError.value = null
  try {
    const { data } = await generateRecipe(title)
    startPolling(data.task_id)
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    convertError.value = msg ?? 'Failed to start recipe generation. Please try again.'
    convertingTitle.value = null
  }
}
```

Add event handlers on `<MealSuggestionPanel>` and `<MealPlanGrid>` in the template:
- On `<MealSuggestionPanel>`: `@open-recipe="openRecipeDrawer"`
- On `<MealPlanGrid>`: `@open-recipe="openRecipeDrawer"`

Add `<RecipeDrawer>` to the template (inside `.timeline-view`, before closing tag):
```html
    <RecipeDrawer
      v-if="drawerOpen"
      :recipe-id="drawerRecipeId ?? undefined"
      :draft-recipe="drawerDraftRecipe ?? undefined"
      @close="closeDrawer"
      @saved="handleDrawerSaved"
    />
```

Pass `convertingTitle` down to `MealSuggestionPanel` for the in-flight chip state:
- Add `:converting-title="convertingTitle"` on `<MealSuggestionPanel>`
- In `MealSuggestionPanel`, add prop `convertingTitle?: string | null` and pass to chips
- In `MealSuggestionChip`, add prop `converting?: boolean` and show a spinner text when true:

In `MealSuggestionChip.vue` props:
```typescript
const props = defineProps<{ suggestion: MealSuggestion; converting?: boolean }>()
```

In `MealSuggestionPanel.vue` props and chip rendering:
```typescript
defineProps<{ suggestions: MealSuggestion[]; loading: boolean; convertingTitle?: string | null }>()
```
```html
      <MealSuggestionChip
        v-for="(s, i) in suggestions"
        :key="i"
        :suggestion="s"
        :converting="convertingTitle === s.title"
        @convert-to-recipe="handleConvertToRecipe"
        @open-recipe="(id) => emit('open-recipe', id)"
      />
```

In `MealSuggestionChip.vue` template, update the `→ recipe` button to disable when converting:
```html
    <button
      v-if="suggestion.entry_type === 'suggestion'"
      class="convert-btn"
      data-testid="convert-to-recipe"
      :disabled="converting"
      @click.stop="!converting && emit('convert-to-recipe', suggestion.title)"
    >
      {{ converting ? '…' : '→ recipe' }}
    </button>
```

- [ ] **Step 6: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 7: Run unit tests**

```bash
cd frontend && npm run test:unit
```

Expected: all pass

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/components/MealSlot.vue src/components/MealPlanGrid.vue src/components/MealSuggestionChip.vue src/components/MealSuggestionPanel.vue src/views/TimelineView.vue
git commit -m "feat: recipe links open drawer; generate recipe shows draft in drawer"
```

---

## Task 7: Smoke test the full feature set

- [ ] **Step 1: Start the dev stack**

In one terminal, start the backend:
```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

In another terminal, start the frontend:
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Test drag-to-shortlist from AI suggestions**

1. Open the Timeline view
2. Generate suggestions (click Regen)
3. Drag a suggestion chip to the "drop here to save for later" zone in the Shortlist panel
4. Expected: the item appears in the shortlist with correct icon (📚 for recipe, ✨ for suggestion)

- [ ] **Step 3: Test drag-to-shortlist from meal plan slots**

1. Drop a suggestion from AI panel onto a meal plan slot
2. Then drag that slot's content to the shortlist drop zone
3. Expected: item appears in shortlist

- [ ] **Step 4: Test recipe drawer from AI suggestion chip**

1. Ensure suggestions are showing and at least one has `entry_type === 'recipe'` (📚 icon)
2. Click on the chip title area
3. Expected: RecipeDrawer slides in showing full recipe with ingredients and steps

- [ ] **Step 5: Test recipe drawer from meal plan slot**

1. Drop a recipe-type suggestion onto a meal slot
2. Click the recipe title in the slot
3. Expected: RecipeDrawer opens with the correct recipe

- [ ] **Step 6: Test "→ recipe" draft flow**

1. Click "→ recipe" on a suggestion-type chip (✨ icon)
2. Button should show "…" while converting
3. When complete, RecipeDrawer opens showing the draft with "Draft — not yet saved" banner
4. Full recipe data (steps, tags) should be visible
5. Click "Dismiss" — drawer closes, no recipe saved (check recipe list)
6. Repeat: click "→ recipe" again on same chip, this time click "Save to my recipes"
7. Expected: recipe appears in the recipe list

- [ ] **Step 7: Test in-flight guard**

1. Click "→ recipe" rapidly multiple times
2. Expected: only one task fires (button shows "…" after first click and ignores subsequent clicks)

- [ ] **Step 8: Test "Show later" button**

1. In Timeline view, click "↓ Show later"
2. Expected: grid extends by 7 more days without losing existing entries

- [ ] **Step 9: Test recipe deletion**

1. Open a recipe that appears in a meal plan slot
2. Delete the recipe (confirm "Yes, delete")
3. Expected: deletion succeeds (no error message), recipe disappears from recipe list
4. Open Timeline view — the slot that had the recipe should show a freetext note with the recipe's title

- [ ] **Step 10: Run full backend test suite**

```bash
cd backend && pytest --cov=app --cov-report=term-missing
```

Expected: all pass, coverage ≥ 80%

- [ ] **Step 11: Run full frontend test suite**

```bash
cd frontend && npm run test:unit
```

Expected: all pass
