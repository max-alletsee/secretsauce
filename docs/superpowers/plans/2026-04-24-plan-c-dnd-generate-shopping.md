# Plan C: Drag-and-Drop, Recipe Generate, Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire drag-and-drop from AI suggestions and shortlist onto timeline meal slots; add AI-powered recipe generation from a suggestion title; replace the per-plan shopping list with a standalone entry-selection checkboard.

**Architecture:** Drag-and-drop uses `vuedraggable` with a typed `DragItem` payload carried via `dataTransfer`. Recipe generation adds a new `POST /api/v1/recipes/generate` endpoint that calls Gemini with a title prompt, reusing the existing import task pattern. Shopping list gains a new `POST /api/v1/shopping-lists/generate` endpoint accepting a list of `entry_ids`, plus a standalone frontend checkboard view.

**Tech Stack:** Vue 3 Composition API, vuedraggable (Sortable.js), FastAPI, Gemini AI SDK, Pinia

**Prerequisite:** Plan B must be complete (TimelineView and `useTimelineStore` must exist).

---

### Task 1: Wire drag-and-drop from suggestions and shortlist onto meal slots

**Files:**
- Modify: `frontend/src/components/MealSuggestionChip.vue`
- Modify: `frontend/src/components/ShortlistPanel.vue`
- Modify: `frontend/src/components/MealSlot.vue`
- Modify: `frontend/src/components/MealPlanGrid.vue`
- Modify: `frontend/src/views/TimelineView.vue`
- Create: `frontend/src/types/dragItem.ts`

Note: `vuedraggable` is already specified in `frontend/CLAUDE.md`. Confirm it's installed:

```bash
cd frontend && npm list vuedraggable 2>/dev/null || npm install vuedraggable@next
```

- [ ] **Step 1: Define the `DragItem` type**

Create `frontend/src/types/dragItem.ts`:

```typescript
// frontend/src/types/dragItem.ts
import type { MealSuggestion } from '@/types/mealPlan'
import type { ShortlistEntry } from '@/types/mealPlan'

export type DragItem =
  | { kind: 'suggestion'; suggestion: MealSuggestion }
  | { kind: 'shortlist'; entry: ShortlistEntry }
```

- [ ] **Step 2: Update `MealSuggestionChip.vue` to emit drag payload**

Replace the full contents of `frontend/src/components/MealSuggestionChip.vue`:

```vue
<script setup lang="ts">
import type { MealSuggestion } from '@/types/mealPlan'
import type { DragItem } from '@/types/dragItem'

const props = defineProps<{ suggestion: MealSuggestion }>()
const emit = defineEmits<{
  (e: 'convert-to-recipe', title: string): void
  (e: 'drag-start', item: DragItem): void
}>()

function onDragStart(event: DragEvent) {
  const item: DragItem = { kind: 'suggestion', suggestion: props.suggestion }
  event.dataTransfer?.setData('application/json', JSON.stringify(item))
  emit('drag-start', item)
}
</script>

<template>
  <div
    class="suggestion-chip"
    :class="suggestion.entry_type"
    :data-testid="`chip-${suggestion.entry_type}`"
    draggable="true"
    @dragstart="onDragStart"
  >
    <span class="chip-icon">{{ suggestion.entry_type === 'recipe' ? '📚' : '✨' }}</span>
    <span class="chip-title">{{ suggestion.title }}</span>
    <button
      v-if="suggestion.entry_type === 'suggestion'"
      class="convert-btn"
      data-testid="convert-to-recipe"
      @click.stop="emit('convert-to-recipe', suggestion.title)"
    >
      → recipe
    </button>
  </div>
</template>

<style scoped>
.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: grab;
  user-select: none;
}
.suggestion-chip.recipe {
  background: #e8f0fe;
  border-left: 3px solid #4285f4;
}
.suggestion-chip.suggestion {
  background: #fff8e1;
  border-left: 3px solid #f5a623;
  font-style: italic;
}
.convert-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  margin-left: 0.25rem;
}
.convert-btn:hover { color: #333; }
</style>
```

- [ ] **Step 3: Update `ShortlistPanel.vue` to emit drag payload**

Replace the full contents of `frontend/src/components/ShortlistPanel.vue`:

```vue
<script setup lang="ts">
import type { ShortlistEntry } from '@/types/mealPlan'
import type { DragItem } from '@/types/dragItem'

defineProps<{ entries: ShortlistEntry[] }>()
const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'drag-start', item: DragItem): void
}>()

function onDragStart(event: DragEvent, entry: ShortlistEntry) {
  const item: DragItem = { kind: 'shortlist', entry }
  event.dataTransfer?.setData('application/json', JSON.stringify(item))
  emit('drag-start', item)
}
</script>

<template>
  <div class="shortlist-panel">
    <div class="panel-header">
      <span class="panel-label">Shortlist ★</span>
    </div>

    <div class="entry-list">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="shortlist-entry"
        :class="entry.entry_type"
        draggable="true"
        @dragstart="(e) => onDragStart(e, entry)"
      >
        <span class="entry-icon">{{ entry.entry_type === 'recipe' ? '📚' : '✨' }}</span>
        <span class="entry-note">{{ entry.note ?? entry.recipe_id }}</span>
        <button
          class="remove-btn"
          :data-testid="`remove-shortlist-${entry.id}`"
          @click="emit('remove', entry.id)"
        >
          ×
        </button>
      </div>

      <div class="drop-zone">drop here to save for later</div>
    </div>
  </div>
</template>

<style scoped>
.shortlist-panel {
  background: #f0fff4;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-width: 180px;
}
.panel-header { margin-bottom: 0.5rem; }
.panel-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  font-weight: 600;
}
.entry-list { display: flex; flex-direction: column; gap: 0.35rem; }
.shortlist-entry {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: grab;
}
.shortlist-entry.recipe { background: #e8f0fe; border-left: 3px solid #2ecc71; }
.shortlist-entry.suggestion { background: #fff8e1; border-left: 3px solid #27ae60; font-style: italic; }
.entry-note { flex: 1; }
.remove-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
.remove-btn:hover { color: #e94560; }
.drop-zone {
  border: 1px dashed #ccc;
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  font-size: 0.75rem;
  color: #aaa;
  text-align: center;
}
</style>
```

- [ ] **Step 4: Update `MealSlot.vue` to accept drops**

In `frontend/src/components/MealSlot.vue`, add `@dragover.prevent` and `@drop` handlers. Update the template's root div:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { TimelineEntry } from '@/types/timeline'
import type { DragItem } from '@/types/dragItem'

const props = defineProps<{
  entry: TimelineEntry | null
  mealType: string
  recipeTitle?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'save-text', text: string): void
  (e: 'clear'): void
  (e: 'drop-item', item: DragItem): void
}>()

const editing = ref(false)
const inputText = ref('')
const dragOver = ref(false)

function startEditing() {
  editing.value = true
  inputText.value = ''
}

function submitText() {
  if (inputText.value.trim()) {
    emit('save-text', inputText.value.trim())
  }
  editing.value = false
}

function cancelEdit() {
  editing.value = false
}

function onDragOver(event: DragEvent) {
  if (props.disabled) return
  event.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  if (props.disabled) return
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const item: DragItem = JSON.parse(raw)
    emit('drop-item', item)
  } catch {
    // ignore malformed drag data
  }
}
</script>

<template>
  <div
    class="meal-slot"
    :class="[entry?.entry_type, { 'meal-slot--disabled': disabled, 'meal-slot--drag-over': dragOver }]"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <span class="slot-label">{{ mealType.toUpperCase() }}</span>

    <div v-if="editing" class="slot-edit">
      <input
        v-model="inputText"
        data-testid="slot-text-input"
        type="text"
        placeholder="Type a note…"
        autofocus
        @keyup.enter="submitText"
        @keyup.escape="cancelEdit"
      />
    </div>

    <span v-else-if="entry && entry.entry_type === 'recipe'" class="slot-content recipe">
      {{ recipeTitle ?? entry.recipe_id }}
    </span>
    <span v-else-if="entry && entry.entry_type === 'suggestion'" class="slot-content suggestion">
      ✨ {{ entry.note }}
    </span>
    <span v-else-if="entry && entry.entry_type === 'freetext'" class="slot-content freetext">
      {{ entry.note }}
    </span>
    <span
      v-else
      class="slot-empty"
      data-testid="slot-empty"
      @click="!disabled && startEditing()"
    >
      drop here…
    </span>

    <button
      v-if="entry && !editing"
      class="clear-btn"
      data-testid="slot-clear"
      @click.stop="emit('clear')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.meal-slot {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: #f0f4ff;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  min-height: 2.25rem;
  cursor: pointer;
  transition: background 0.1s;
}
.meal-slot--disabled { cursor: default; }
.meal-slot--drag-over { background: #dbeafe; outline: 2px dashed #2563eb; }
.slot-label { font-size: 0.7rem; color: #999; font-weight: 600; flex-shrink: 0; }
.slot-content { flex: 1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slot-content.recipe { color: #1a73e8; }
.slot-content.suggestion { color: #f5a623; font-style: italic; }
.slot-content.freetext { color: #333; }
.slot-empty { flex: 1; font-size: 0.85rem; color: #bbb; font-style: italic; }
.slot-edit { flex: 1; }
.slot-edit input { width: 100%; border: none; background: transparent; font-size: 0.9rem; outline: none; }
.clear-btn { background: none; border: none; color: #ccc; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0; flex-shrink: 0; }
.clear-btn:hover { color: #e94560; }
</style>
```

- [ ] **Step 5: Propagate `drop-item` through `MealPlanGrid.vue`**

In `frontend/src/components/MealPlanGrid.vue`, update the emits and the `MealSlot` usage:

In `<script setup>`, update emits:
```typescript
const emit = defineEmits<{
  (e: 'save-text', date: string, mealType: string, text: string): void
  (e: 'clear-entry', entryId: string): void
  (e: 'drop-item', item: unknown, date: string, mealType: string): void
}>()
```

In the template, on the `MealSlot` component, add:
```html
@drop-item="(item) => emit('drop-item', item, day, mealType)"
```

- [ ] **Step 6: Handle drops in `TimelineView.vue`**

In `frontend/src/views/TimelineView.vue`, add the drop handler and the `convert-to-recipe` handler. Add these imports at the top of `<script setup>`:

```typescript
import type { DragItem } from '@/types/dragItem'
import { useImportPolling } from '@/composables/useImportPolling'
import * as recipesApi from '@/api/recipes'
```

Add inside the `<script setup>` block:

```typescript
const { startPolling: startGeneratePolling } = useImportPolling(
  (recipeId, recipeData) => {
    router.push({
      name: 'recipe-edit',
      params: { id: recipeId },
      state: { importedRecipe: recipeData ?? null },
    })
  }
)

async function handleDropItem(item: unknown, date: string, mealType: string) {
  const drag = item as DragItem
  if (drag.kind === 'suggestion') {
    const s = drag.suggestion
    if (s.entry_type === 'recipe' && s.matched_recipe_id) {
      await timelineStore.addEntry({ date, meal_type: mealType, recipe_id: s.matched_recipe_id, entry_type: 'recipe', source: 'ai_suggested' })
    } else {
      await timelineStore.addEntry({ date, meal_type: mealType, note: s.title, entry_type: 'suggestion', source: 'ai_suggested' })
    }
  } else if (drag.kind === 'shortlist') {
    const entry = drag.entry
    if (entry.recipe_id) {
      await timelineStore.addEntry({ date, meal_type: mealType, recipe_id: entry.recipe_id, entry_type: 'recipe', source: 'manual' })
    } else {
      await timelineStore.addEntry({ date, meal_type: mealType, note: entry.note ?? '', entry_type: 'suggestion', source: 'manual' })
    }
  }
}

async function handleConvertToRecipe(title: string) {
  const { data } = await recipesApi.generateRecipe(title)
  startGeneratePolling(data.task_id)
}
```

Update the `MealPlanGrid` element in the template to add:
```html
@drop-item="handleDropItem"
```

Update `MealSuggestionPanel` to add:
```html
@convert-to-recipe="handleConvertToRecipe"
```

- [ ] **Step 7: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/dragItem.ts frontend/src/components/MealSuggestionChip.vue frontend/src/components/ShortlistPanel.vue frontend/src/components/MealSlot.vue frontend/src/components/MealPlanGrid.vue frontend/src/views/TimelineView.vue
git commit -m "feat: wire drag-and-drop from suggestions and shortlist onto meal slots"
```

---

### Task 2: Backend — `POST /api/v1/recipes/generate` endpoint

**Files:**
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/app/services/recipe_import_service.py`
- Modify: `backend/app/api/routes/import_tasks.py`
- Test: `backend/tests/unit/test_recipe_import_service.py`
- Test: `backend/tests/integration/test_import_routes.py`

- [ ] **Step 1: Write a failing unit test for the generate service function**

Add to `backend/tests/unit/test_recipe_import_service.py`:

```python
@pytest.mark.asyncio
async def test_process_generate_task_creates_recipe_and_embeds_result():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    fake_result = RecipeImportResult(
        title="Chicken Tikka Masala",
        description="A rich Indian curry.",
        ingredients=[ImportedIngredient(name="chicken", quantity="500", unit="g")],
        steps=[ImportedStep(order=1, instruction="Marinate chicken.")],
        servings=4,
        tags=["indian", "dinner"],
    )

    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id
    mock_recipe.owner_id = user_id
    mock_recipe.visibility = "private"
    mock_recipe.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    mock_recipe.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)

    mock_version = MagicMock()
    mock_version.title = "Chicken Tikka Masala"
    mock_version.description = "A rich Indian curry."
    mock_version.ingredients = [{"name": "chicken", "quantity": "500", "unit": "g"}]
    mock_version.steps = [{"order": 1, "instruction": "Marinate chicken."}]
    mock_version.servings = 4
    mock_version.prep_time_minutes = None
    mock_version.waiting_time_minutes = None
    mock_version.cook_time_minutes = None
    mock_version.tags = ["indian", "dinner"]
    mock_version.recipe_source = None
    mock_version.id = uuid.uuid4()
    mock_version.recipe_id = recipe_id
    mock_version.version_number = 1
    mock_version.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)

    mock_task = MagicMock()
    mock_task.id = task_id
    mock_task.result_data = None

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=mock_task)
    mock_db.commit = AsyncMock()

    with (
        patch("app.services.recipe_import_service.async_session_factory") as mock_factory,
        patch("app.services.recipe_import_service.ai_service.generate_recipe_from_title", return_value=fake_result),
        patch("app.services.recipe_import_service.recipe_service.create_recipe", return_value=(mock_recipe, mock_version)),
    ):
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.services.recipe_import_service import process_generate_task
        await process_generate_task(task_id, "Chicken Tikka Masala", user_id)

    assert mock_task.result_data is not None
    assert "recipe" in mock_task.result_data
    assert mock_task.result_data["recipe"]["current_version"]["title"] == "Chicken Tikka Masala"
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py::test_process_generate_task_creates_recipe_and_embeds_result -v
```

Expected: FAIL — `process_generate_task` does not exist.

- [ ] **Step 3: Add `generate_recipe_from_title` to `ai_service.py`**

In `backend/app/services/ai_service.py`, add the prompt constant and the function after the existing image import function:

```python
_GENERATE_RECIPE_PROMPT_TEMPLATE = (
    "Create a complete, detailed recipe for: {title}\n\n"
    "Return a well-structured recipe with: title, description, full ingredients list with "
    "quantities and units, numbered cooking steps, servings count, prep/cook/waiting times "
    "in minutes. "
    "For tags, only use values from this exact list: "
    "vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, "
    "low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, "
    "spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, "
    "italian, mexican, japanese, chinese, indian, thai, french, greek, "
    "middle-eastern, american, korean."
)


async def generate_recipe_from_title(
    title: str,
    user_id: "_uuid.UUID | None" = None,
    db=None,  # AsyncSession | None
) -> RecipeImportResult:
    """Call Gemini to generate a complete recipe from a dish title.

    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    prompt = _GENERATE_RECIPE_PROMPT_TEMPLATE.format(title=title)
    last_error: Exception | None = None
    elapsed: float = 0.0

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=RecipeImportResult,
                    ),
                ),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            elapsed = time.monotonic() - start
            usage = response.usage_metadata
            logger.info(
                "AI generate success | model=%s title=%s latency=%.2fs tokens_in=%d tokens_out=%d",
                settings.AI_MODEL,
                title,
                elapsed,
                usage.prompt_token_count if usage else 0,
                usage.candidates_token_count if usage else 0,
            )
            await _write_ai_log(
                db, user_id=user_id, call_type="recipe_generate", model=settings.AI_MODEL,
                prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
                input_tokens=usage.prompt_token_count if usage else 0,
                output_tokens=usage.candidates_token_count if usage else 0,
                success=True, error_message=None,
            )
            return RecipeImportResult.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI generate attempt %d/%d failed | title=%s latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                title,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    await _write_ai_log(
        db, user_id=user_id, call_type="recipe_generate", model=settings.AI_MODEL,
        prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
    raise AIServiceError(
        f"Generate failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error
```

- [ ] **Step 4: Add `process_generate_task` to `recipe_import_service.py`**

Add at the end of `backend/app/services/recipe_import_service.py`:

```python
async def process_generate_task(task_id: uuid.UUID, title: str, user_id: uuid.UUID) -> None:
    """Background task: call Gemini to generate a recipe from a title, save it, update the task."""
    async with async_session_factory() as db:
        task = await db.get(ImportTask, task_id)
        if task is None:
            logger.error("ImportTask %s not found — skipping", task_id)
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

            filtered_tags = [t for t in result.tags if t in ALL_TAGS]

            recipe_data = RecipeCreate(
                title=result.title,
                description=result.description,
                ingredients=[
                    Ingredient(name=i.name, quantity=i.quantity, unit=i.unit)
                    for i in result.ingredients
                ],
                steps=[
                    Step(order=s.order, instruction=s.instruction)
                    for s in result.steps
                ],
                servings=result.servings if result.servings is not None else 2,
                prep_time_minutes=result.prep_time_minutes,
                waiting_time_minutes=result.waiting_time_minutes,
                cook_time_minutes=result.cook_time_minutes,
                tags=filtered_tags,
                recipe_source=None,
            )

            recipe, version = await recipe_service.create_recipe(db, user_id, recipe_data)

            from app.schemas.recipe import RecipeVersionResponse
            version_data = RecipeVersionResponse.model_validate(version).model_dump(mode="json")
            recipe_payload = {
                "id": str(recipe.id),
                "owner_id": str(recipe.owner_id),
                "visibility": recipe.visibility,
                "current_version": version_data,
                "created_at": recipe.created_at.isoformat(),
                "updated_at": recipe.updated_at.isoformat(),
            }

            task.status = ImportTaskStatus.COMPLETED
            task.recipe_id = recipe.id
            task.result_data = {"recipe": recipe_payload}
            task.updated_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.error("Generate task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)

        db.add(task)
        await db.commit()
```

- [ ] **Step 5: Run the unit test**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py::test_process_generate_task_creates_recipe_and_embeds_result -v
```

Expected: PASS

- [ ] **Step 6: Write a failing integration test for the endpoint**

Add to `backend/tests/integration/test_import_routes.py`:

```python
def test_generate_recipe_returns_202(client, auth_headers):
    """POST /api/v1/recipes/generate should accept a title and return a task_id."""
    with patch("app.api.routes.import_tasks.process_generate_task"):
        response = client.post(
            "/api/v1/recipes/generate",
            json={"title": "Chicken Tikka Masala"},
            headers=auth_headers,
        )
    assert response.status_code == 202
    data = response.json()
    assert "task_id" in data
    assert data["status"] == "pending"
```

- [ ] **Step 7: Add the endpoint to `import_tasks.py`**

Add to `backend/app/api/routes/import_tasks.py`:

```python
from app.services.recipe_import_service import process_generate_task

class RecipeGenerateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)

from pydantic import BaseModel, Field

@recipes_router.post("/generate", status_code=202, response_model=ImportTaskCreated)
async def generate_recipe(
    payload: RecipeGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    check_import_rate_limit(str(user.id))
    task = ImportTask(user_id=user.id, task_type="recipe_generate")
    db.add(task)
    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(process_generate_task, task.id, payload.title, user.id)
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)
```

Note: Move the `BaseModel` and `Field` imports to the top of the file alongside existing imports. `RecipeGenerateRequest` should be defined before the route function.

- [ ] **Step 8: Run integration test**

```bash
cd backend && pytest tests/integration/test_import_routes.py::test_generate_recipe_returns_202 -v
```

Expected: PASS

- [ ] **Step 9: Add `generateRecipe` to frontend API client**

In `frontend/src/api/recipes.ts`, add:

```typescript
export const generateRecipe = (title: string) =>
  client.post<ImportTaskCreated>('/recipes/generate', { title })
```

Also add the import at the top of that file:
```typescript
import type { ImportTaskCreated } from '@/types/importTask'
```

- [ ] **Step 10: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 11: Commit**

```bash
git add backend/app/services/ai_service.py backend/app/services/recipe_import_service.py backend/app/api/routes/import_tasks.py backend/tests/unit/test_recipe_import_service.py backend/tests/integration/test_import_routes.py frontend/src/api/recipes.ts
git commit -m "feat: add recipe generate endpoint and AI service function for title-to-recipe"
```

---

### Task 3: Backend — standalone shopping list generate endpoint

**Files:**
- Modify: `backend/app/models/shopping_list.py`
- Modify: `backend/app/services/shopping.py`
- Modify: `backend/app/api/routes/shopping_lists.py`
- Create: `backend/alembic/versions/<auto>_shopping_list_standalone.py`
- Test: `backend/tests/integration/test_shopping_routes.py`

- [ ] **Step 1: Update `ShoppingList` model**

In `backend/app/models/shopping_list.py`, make `meal_plan_id` nullable, add `entry_ids`, `from_date`, `to_date`. Replace the `ShoppingList` class:

```python
import datetime as _dt

class ShoppingList(SQLModel, table=True):
    __tablename__ = "shopping_lists"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_shopping_lists_user_id"),
            nullable=False,
            index=True,
        )
    )
    meal_plan_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_shopping_lists_meal_plan_id"),
            nullable=True,
        )
    )
    entry_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    from_date: _dt.date | None = Field(
        default=None, sa_column=Column(Date, nullable=True)
    )
    to_date: _dt.date | None = Field(
        default=None, sa_column=Column(Date, nullable=True)
    )
    name: str = Field(sa_column=Column(String(255), nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )
```

Add `Date` to the imports from `sqlalchemy`: `from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, Uuid, text`

Also remove the `UniqueConstraint` on `meal_plan_id` since it's now nullable and no longer the unique key. Remove `__table_args__` entirely.

- [ ] **Step 2: Generate and apply migration**

```bash
cd backend && alembic revision --autogenerate -m "shopping_list_standalone" && alembic upgrade head
```

Review the generated migration. It should: drop the unique constraint on `meal_plan_id`, alter `meal_plan_id` to nullable, add `entry_ids`, `from_date`, `to_date` columns.

- [ ] **Step 3: Write a failing integration test**

Add to `backend/tests/integration/test_shopping_routes.py`:

```python
def test_generate_shopping_list_from_entry_ids(client, auth_headers, seeded_timeline_entries):
    """POST /api/v1/shopping-lists/generate accepts entry_ids and returns 202."""
    entry_ids = [str(e.id) for e in seeded_timeline_entries]
    with patch("app.api.routes.shopping_lists.process_shopping_generate"):
        response = client.post(
            "/api/v1/shopping-lists/generate",
            json={"entry_ids": entry_ids, "name": "Test list"},
            headers=auth_headers,
        )
    assert response.status_code == 202
    data = response.json()
    assert "task_id" in data

def test_list_shopping_lists(client, auth_headers):
    response = client.get("/api/v1/shopping-lists", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

- [ ] **Step 4: Add `generate_from_entries` service function to `shopping.py`**

Add to `backend/app/services/shopping.py`:

```python
import uuid as _uuid
from datetime import date as _date


async def generate_shopping_list_from_entries(
    db: AsyncSession,
    user_id: _uuid.UUID,
    entry_ids: list[_uuid.UUID],
    name: str,
) -> ShoppingList:
    """Create a new shopping list from a set of timeline entry IDs.

    Fetches MealPlanEntry rows for the given IDs (owned by user), aggregates
    ingredients, calls Gemini, and persists a new ShoppingList with items.
    """
    from app.services import ai_service

    # Fetch entries, verify ownership
    entries_result = await db.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.id.in_(entry_ids),
            MealPlanEntry.user_id == user_id,
            MealPlanEntry.recipe_id.is_not(None),
        )
    )
    entries = list(entries_result.scalars().all())

    # Compute date range from entries
    dates = [e.date for e in entries]
    from_date: _date | None = min(dates) if dates else None
    to_date: _date | None = max(dates) if dates else None

    # Build raw ingredient lines (same logic as regenerate_shopping_list)
    raw_lines: list[str] = []
    recipe_name_to_id: dict[str, _uuid.UUID] = {}

    for entry in entries:
        version_result = await db.execute(
            select(RecipeVersion)
            .join(Recipe, Recipe.current_version_id == RecipeVersion.id)
            .where(Recipe.id == entry.recipe_id)
        )
        version = version_result.scalar_one_or_none()
        if not version:
            continue

        scaled = _scale_ingredients(
            version.ingredients or [],
            entry.servings,
            version.servings,
        )
        recipe_name_to_id[version.title] = entry.recipe_id
        for ing in scaled:
            qty = ing["scaled_qty"]
            unit = ing.get("unit") or ""
            name_part = ing.get("name", "")
            raw_lines.append(f"{qty:.2f} {unit} {name_part} — for {version.title}")

    if not raw_lines:
        # No recipes with ingredients — create empty list
        shopping_list = ShoppingList(
            user_id=user_id,
            entry_ids=[str(eid) for eid in entry_ids],
            from_date=from_date,
            to_date=to_date,
            name=name,
        )
        db.add(shopping_list)
        await db.commit()
        await db.refresh(shopping_list)
        return shopping_list

    prompt = _build_ai_prompt(raw_lines)
    ai_result: ShoppingListAIResult = await ai_service.generate_shopping_list(prompt)

    shopping_list = ShoppingList(
        user_id=user_id,
        entry_ids=[str(eid) for eid in entry_ids],
        from_date=from_date,
        to_date=to_date,
        name=name,
    )
    db.add(shopping_list)
    await db.commit()
    await db.refresh(shopping_list)

    for item in ai_result.items:
        recipe_ids_for_item = [
            str(recipe_name_to_id[rn]) for rn in item.recipe_names if rn in recipe_name_to_id
        ]
        db.add(ShoppingListItem(
            shopping_list_id=shopping_list.id,
            ingredient_name=item.ingredient_name,
            total_quantity=item.total_quantity,
            unit=item.unit,
            detail=item.detail,
            category=item.category,
            recipe_ids=recipe_ids_for_item,
        ))
    await db.commit()
    return shopping_list
```

Note: You'll also need to check that `ai_service.generate_shopping_list(prompt)` exists. If the existing function is named differently (check `ai_service.py`), use the correct name.

- [ ] **Step 5: Add the endpoint and list endpoint to `shopping_lists.py`**

In `backend/app/api/routes/shopping_lists.py`, add:

```python
from app.services.shopping import generate_shopping_list_from_entries
from app.schemas.shopping_list import ShoppingListGenerateRequest, ShoppingListSummaryResponse

@router.post("/generate", status_code=202, response_model=ImportTaskCreated)
async def generate_shopping_list(
    payload: ShoppingListGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    from app.models.import_task import ImportTask, ImportTaskStatus
    task = ImportTask(user_id=user.id, task_type="shopping_generate")
    db.add(task)
    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(
        process_shopping_generate,
        task.id,
        [uuid.UUID(eid) for eid in payload.entry_ids],
        payload.name,
        user.id,
    )
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)


@router.get("", response_model=list[ShoppingListSummaryResponse])
async def list_shopping_lists(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[ShoppingListSummaryResponse]:
    from sqlalchemy import select
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.user_id == user.id)
        .order_by(ShoppingList.created_at.desc())
    )
    lists = list(result.scalars().all())
    return [ShoppingListSummaryResponse.model_validate(sl) for sl in lists]
```

Add a background task function `process_shopping_generate` in `shopping.py` (or a new `background_tasks/shopping_generate.py`) following the same pattern as `process_url_import`:

```python
async def process_shopping_generate(
    task_id: _uuid.UUID,
    entry_ids: list[_uuid.UUID],
    name: str,
    user_id: _uuid.UUID,
) -> None:
    from app.core.database import async_session_factory
    from app.models.import_task import ImportTask, ImportTaskStatus
    from datetime import datetime, timezone
    async with async_session_factory() as db:
        task = await db.get(ImportTask, task_id)
        if task is None:
            return
        task.status = ImportTaskStatus.PROCESSING
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)
        await db.commit()
        try:
            shopping_list = await generate_shopping_list_from_entries(db, user_id, entry_ids, name)
            task.status = ImportTaskStatus.COMPLETED
            task.result_data = {"shopping_list_id": str(shopping_list.id)}
            task.updated_at = datetime.now(timezone.utc)
        except Exception as exc:
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)
        db.add(task)
        await db.commit()
```

Add to `backend/app/schemas/shopping_list.py` (create if needed):

```python
# backend/app/schemas/shopping_list.py
import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict


class ShoppingListGenerateRequest(BaseModel):
    entry_ids: list[str]
    name: str


class ShoppingListSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    from_date: date | None
    to_date: date | None
    created_at: datetime
```

- [ ] **Step 6: Run integration tests**

```bash
cd backend && pytest tests/integration/test_shopping_routes.py -v
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/shopping_list.py backend/app/services/shopping.py backend/app/api/routes/shopping_lists.py backend/app/schemas/shopping_list.py backend/alembic/versions/ backend/tests/integration/test_shopping_routes.py
git commit -m "feat: standalone shopping list generate endpoint from entry_ids"
```

---

### Task 4: Frontend — shopping list checkboard and standalone views

**Files:**
- Create: `frontend/src/views/ShoppingListsView.vue`
- Create: `frontend/src/views/ShoppingListNewView.vue`
- Modify: `frontend/src/api/shoppingLists.ts`
- Modify: `frontend/src/types/shoppingList.ts`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: Update shopping list types**

In `frontend/src/types/shoppingList.ts`, add:

```typescript
export interface ShoppingListSummary {
  id: string
  name: string
  from_date: string | null
  to_date: string | null
  created_at: string
}
```

- [ ] **Step 2: Update shopping list API client**

In `frontend/src/api/shoppingLists.ts`, add:

```typescript
import type { ShoppingListSummary } from '@/types/shoppingList'
import type { ImportTaskCreated } from '@/types/importTask'

export const listShoppingLists = () =>
  client.get<ShoppingListSummary[]>('/shopping-lists')

export const generateShoppingList = (entryIds: string[], name: string) =>
  client.post<ImportTaskCreated>('/shopping-lists/generate', { entry_ids: entryIds, name })
```

- [ ] **Step 3: Create `ShoppingListsView.vue`**

Create `frontend/src/views/ShoppingListsView.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as shoppingApi from '@/api/shoppingLists'
import type { ShoppingListSummary } from '@/types/shoppingList'

const router = useRouter()
const lists = ref<ShoppingListSummary[]>([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await shoppingApi.listShoppingLists()
    lists.value = data
  } finally {
    loading.value = false
  }
})

function formatDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return ''
  if (from && to && from === to) return from
  return `${from ?? '?'} – ${to ?? '?'}`
}
</script>

<template>
  <main class="lists-page">
    <div class="lists-header">
      <h1>Shopping Lists</h1>
      <router-link to="/shopping-lists/new" class="new-btn">+ New list</router-link>
    </div>

    <p v-if="loading" class="empty">Loading…</p>
    <p v-else-if="lists.length === 0" class="empty">
      No shopping lists yet.
      <router-link to="/shopping-lists/new">Create one</router-link> from your meal plan.
    </p>

    <div v-else class="list-grid">
      <div
        v-for="sl in lists"
        :key="sl.id"
        class="list-card"
        @click="router.push(`/shopping-lists/${sl.id}`)"
      >
        <div class="list-name">{{ sl.name }}</div>
        <div class="list-dates">{{ formatDateRange(sl.from_date, sl.to_date) }}</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.lists-page { max-width: 800px; margin: 0 auto; padding: 1rem; }
.lists-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
h1 { font-size: 1.5rem; font-weight: 600; margin: 0; }
.new-btn {
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: white;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.875rem;
}
.empty { text-align: center; color: #6b7280; padding: 3rem 0; }
.list-grid { display: flex; flex-direction: column; gap: 0.75rem; }
.list-card {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
}
.list-card:hover { background: #f9fafb; }
.list-name { font-weight: 600; margin-bottom: 0.25rem; }
.list-dates { font-size: 0.8rem; color: #6b7280; }
</style>
```

- [ ] **Step 4: Create `ShoppingListNewView.vue`**

Create `frontend/src/views/ShoppingListNewView.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useUserStore } from '@/stores/useUserStore'
import { useImportPolling } from '@/composables/useImportPolling'
import * as shoppingApi from '@/api/shoppingLists'
import type { TimelineEntry } from '@/types/timeline'

const router = useRouter()
const timelineStore = useTimelineStore()
const userStore = useUserStore()

const todayStr = new Date().toISOString().slice(0, 10)
const mealTypes = computed(() => userStore.user?.meal_plan_meal_types ?? ['dinner'])

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const toDate = computed(() => addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7))

// Track checked entry IDs
const checkedEntryIds = ref<Set<string>>(new Set())
const listName = ref('')
const generating = ref(false)
const error = ref('')

const { startPolling } = useImportPolling((_, __, taskResult) => {
  const listId = (taskResult as Record<string, unknown> | undefined)?.shopping_list_id
  if (listId) {
    router.push(`/shopping-lists/${listId}`)
  }
})

// Group entries by date
const entriesByDate = computed(() => {
  const map: Record<string, TimelineEntry[]> = {}
  for (const e of timelineStore.entries) {
    if (!map[e.date]) map[e.date] = []
    map[e.date].push(e)
  }
  return map
})

const days = computed(() => {
  const result: string[] = []
  const end = new Date(toDate.value)
  for (let d = new Date(todayStr); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
})

function isPast(dateStr: string): boolean {
  return dateStr < todayStr
}

function isDayChecked(dateStr: string): boolean {
  const dayEntries = (entriesByDate.value[dateStr] ?? []).filter((e) => e.recipe_id)
  if (dayEntries.length === 0) return false
  return dayEntries.every((e) => checkedEntryIds.value.has(e.id))
}

function isDayIndeterminate(dateStr: string): boolean {
  const dayEntries = (entriesByDate.value[dateStr] ?? []).filter((e) => e.recipe_id)
  const checked = dayEntries.filter((e) => checkedEntryIds.value.has(e.id))
  return checked.length > 0 && checked.length < dayEntries.length
}

function toggleDay(dateStr: string) {
  const dayEntries = (entriesByDate.value[dateStr] ?? []).filter((e) => e.recipe_id)
  const allChecked = isDayChecked(dateStr)
  for (const e of dayEntries) {
    if (allChecked) {
      checkedEntryIds.value.delete(e.id)
    } else {
      checkedEntryIds.value.add(e.id)
    }
  }
}

function toggleEntry(entryId: string) {
  if (checkedEntryIds.value.has(entryId)) {
    checkedEntryIds.value.delete(entryId)
  } else {
    checkedEntryIds.value.add(entryId)
  }
}

function selectAllUpcoming() {
  for (const day of days.value) {
    for (const e of (entriesByDate.value[day] ?? [])) {
      if (e.recipe_id) checkedEntryIds.value.add(e.id)
    }
  }
}

function clearAll() {
  checkedEntryIds.value.clear()
}

const selectedCount = computed(() => checkedEntryIds.value.size)

const selectedRecipeCount = computed(() => {
  const recipeIds = new Set<string>()
  for (const id of checkedEntryIds.value) {
    const e = timelineStore.entries.find((en) => en.id === id)
    if (e?.recipe_id) recipeIds.add(e.recipe_id)
  }
  return recipeIds.size
})

// Auto-set name based on selection date range
const autoName = computed(() => {
  const checkedDates = [...checkedEntryIds.value]
    .map((id) => timelineStore.entries.find((e) => e.id === id)?.date)
    .filter(Boolean)
    .sort() as string[]
  if (checkedDates.length === 0) return 'Shopping list'
  const from = checkedDates[0]
  const to = checkedDates[checkedDates.length - 1]
  return from === to ? `Shopping list ${from}` : `Shopping list ${from} – ${to}`
})

onMounted(async () => {
  await timelineStore.fetchEntries(todayStr, toDate.value)
  // Pre-select all upcoming entries with recipes
  selectAllUpcoming()
  listName.value = autoName.value
})

async function generate() {
  if (checkedEntryIds.value.size === 0) return
  generating.value = true
  error.value = ''
  try {
    const { data } = await shoppingApi.generateShoppingList(
      [...checkedEntryIds.value],
      listName.value || autoName.value,
    )
    startPolling(data.task_id)
  } catch {
    error.value = 'Failed to start. Please try again.'
    generating.value = false
  }
}

function entryLabel(entry: TimelineEntry): string {
  return entry.note ?? entry.recipe_id ?? '(empty)'
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${dateStr}`
}
</script>

<template>
  <main class="new-list-page">
    <h1>New Shopping List</h1>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-actions">
        <button class="toolbar-btn" @click="selectAllUpcoming">Select all upcoming</button>
        <button class="toolbar-btn" @click="clearAll">Clear</button>
      </div>
      <span class="toolbar-summary">{{ selectedCount }} meals selected</span>
    </div>

    <!-- Checkboard table -->
    <div class="checkboard-wrap">
      <table class="checkboard">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th class="col-day">Day</th>
            <th v-for="mt in mealTypes" :key="mt" class="col-meal">{{ mt }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="day in days"
            :key="day"
            :class="{ 'row-today': day === todayStr }"
          >
            <td class="col-check">
              <input
                type="checkbox"
                :checked="isDayChecked(day)"
                :indeterminate="isDayIndeterminate(day)"
                @change="toggleDay(day)"
              />
            </td>
            <td class="col-day">{{ dayLabel(day) }}</td>
            <td v-for="mt in mealTypes" :key="mt" class="col-meal">
              <template v-if="entriesByDate[day]?.find((e) => e.meal_type === mt)">
                <label
                  v-for="entry in entriesByDate[day].filter((e) => e.meal_type === mt)"
                  :key="entry.id"
                  class="meal-label"
                >
                  <input
                    v-if="entry.recipe_id"
                    type="checkbox"
                    :checked="checkedEntryIds.has(entry.id)"
                    @change="toggleEntry(entry.id)"
                  />
                  <span :class="{ 'no-recipe': !entry.recipe_id }">
                    {{ entryLabel(entry) }}
                  </span>
                </label>
              </template>
              <span v-else class="empty-slot">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div class="footer">
      <span class="footer-summary">
        {{ selectedCount }} meals · {{ selectedRecipeCount }} recipes with ingredients
      </span>
      <div class="footer-actions">
        <input v-model="listName" :placeholder="autoName" class="name-input" type="text" />
        <button
          :disabled="selectedCount === 0 || generating"
          class="generate-btn"
          @click="generate"
        >
          {{ generating ? 'Generating…' : 'Generate shopping list →' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </main>
</template>

<style scoped>
.new-list-page { max-width: 900px; margin: 0 auto; padding: 1rem; }
h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1rem; }
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}
.toolbar-actions { display: flex; gap: 0.5rem; }
.toolbar-btn {
  font-size: 0.75rem;
  padding: 3px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}
.toolbar-summary { font-size: 0.75rem; color: #6b7280; }
.checkboard-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
.checkboard { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.checkboard th {
  padding: 6px 10px;
  background: #f3f4f6;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}
.checkboard td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
.col-check { width: 2.5rem; text-align: center; }
.col-day { white-space: nowrap; font-weight: 600; min-width: 10rem; }
.col-meal { min-width: 8rem; }
.row-today { background: #fffbeb; }
.meal-label { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; }
.no-recipe { color: #9ca3af; font-style: italic; }
.empty-slot { color: #d1d5db; }
.footer {
  margin-top: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.footer-summary { font-size: 0.8rem; color: #6b7280; }
.footer-actions { display: flex; gap: 0.5rem; }
.name-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.generate-btn {
  padding: 0.5rem 1.25rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}
.generate-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: #dc2626; font-size: 0.875rem; }
</style>
```

- [ ] **Step 4b: Update `useImportPolling` to pass `result_data` as third argument**

The shopping list polling callback uses `result_data` to get `shopping_list_id`. Update `frontend/src/composables/useImportPolling.ts` (already modified in Plan A) to add a third argument:

```typescript
import { ref, onScopeDispose } from 'vue'
import * as importTasksApi from '@/api/importTasks'
import type { ImportStatus, RecipeData } from '@/types/importTask'

export function useImportPolling(
  onComplete: (
    recipeId: string,
    recipeData?: RecipeData,
    resultData?: Record<string, unknown>,
  ) => void,
) {
  const status = ref<ImportStatus>('idle')
  const error = ref<string | null>(null)
  let intervalId: ReturnType<typeof setInterval> | null = null

  function stopPolling() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function startPolling(taskId: string) {
    status.value = 'pending'
    error.value = null
    intervalId = setInterval(async () => {
      try {
        const { data: task } = await importTasksApi.getImportTask(taskId)
        status.value = task.status as ImportStatus
        if (task.status === 'completed' && task.recipe_id) {
          stopPolling()
          onComplete(task.recipe_id, task.result_data?.recipe, task.result_data ?? undefined)
        } else if (task.status === 'completed' && !task.recipe_id) {
          // Non-recipe task completion (e.g. shopping list)
          stopPolling()
          onComplete('', undefined, task.result_data ?? undefined)
        } else if (task.status === 'failed') {
          stopPolling()
          error.value = task.error_message ?? 'Task failed'
        }
      } catch {
        stopPolling()
        error.value = 'Failed to check status'
        status.value = 'failed'
      }
    }, 3000)
  }

  onScopeDispose(stopPolling)

  return { status, error, startPolling, stopPolling }
}
```

Also update `frontend/src/types/importTask.ts` to allow `result_data` to hold either a recipe or a shopping list id:

```typescript
export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  import_type: 'url' | 'image' | 'meal_suggestions' | 'shopping_generate' | 'recipe_generate'
  result_data: { recipe?: RecipeData; shopping_list_id?: string } | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 5: Update router for shopping list routes**

In `frontend/src/router/index.ts`, replace:

```typescript
    {
      path: '/shopping-lists/:mealPlanId',
      name: 'shopping-list',
      component: () => import('@/views/ShoppingListView.vue'),
      meta: { requiresAuth: true },
    },
```

With:

```typescript
    {
      path: '/shopping-lists',
      name: 'shopping-lists',
      component: () => import('@/views/ShoppingListsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/shopping-lists/new',
      name: 'shopping-list-new',
      component: () => import('@/views/ShoppingListNewView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/shopping-lists/:id',
      name: 'shopping-list',
      component: () => import('@/views/ShoppingListView.vue'),
      meta: { requiresAuth: true },
    },
```

- [ ] **Step 6: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors. Fix any issues around the updated `useImportPolling` callback signature.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/ShoppingListsView.vue frontend/src/views/ShoppingListNewView.vue frontend/src/api/shoppingLists.ts frontend/src/types/shoppingList.ts frontend/src/router/index.ts frontend/src/composables/useImportPolling.ts
git commit -m "feat: standalone shopping list with meal checkboard selection UI"
```

---

### Task 5: Run full test suite

- [ ] **Step 1: Backend tests**

```bash
cd backend && pytest --cov=app --cov-report=term-missing
```

Expected: All pass, coverage ≥ 80%.

- [ ] **Step 2: Frontend tests**

```bash
cd frontend && npm run test:unit
```

Expected: All pass.

- [ ] **Step 3: Frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.
