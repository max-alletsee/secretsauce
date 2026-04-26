# Plan A: Quick Fixes (Import Race + Tags Label) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the recipe import race condition so all fields appear in the editor after import, and add a "Choose from categories" label to TagSelector so users understand tags are selection-only.

**Architecture:** The import race is fixed by embedding the full recipe data in the import task's `result_data` JSONB field at completion time. The frontend reads it from router state instead of issuing a second API fetch. Tags fix is a one-line template addition.

**Tech Stack:** Python/FastAPI backend, Vue 3 / TypeScript frontend, Pinia, Axios

---

### Task 1: Embed recipe data in import task result on URL import

**Files:**
- Modify: `backend/app/services/recipe_import_service.py`
- Modify: `backend/app/schemas/recipe.py` (no change needed — `RecipeVersionResponse` already exists)
- Test: `backend/tests/unit/test_recipe_import_service.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/unit/test_recipe_import_service.py`, add a test that asserts `task.result_data` is populated with recipe data after a successful URL import:

```python
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.ai_responses import (
    ImportedIngredient,
    ImportedStep,
    RecipeImportResult,
)


@pytest.mark.asyncio
async def test_process_url_import_embeds_result_data():
    """After a successful import, task.result_data["recipe"] must be a dict with title/ingredients/steps."""
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    fake_result = RecipeImportResult(
        title="Pasta Carbonara",
        description="A classic Roman pasta.",
        ingredients=[ImportedIngredient(name="spaghetti", quantity="200", unit="g")],
        steps=[ImportedStep(order=1, instruction="Cook pasta.")],
        servings=2,
        tags=["italian", "dinner"],
    )

    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id

    mock_version = MagicMock()
    mock_version.title = "Pasta Carbonara"
    mock_version.description = "A classic Roman pasta."
    mock_version.ingredients = [{"name": "spaghetti", "quantity": "200", "unit": "g"}]
    mock_version.steps = [{"order": 1, "instruction": "Cook pasta."}]
    mock_version.servings = 2
    mock_version.prep_time_minutes = None
    mock_version.waiting_time_minutes = None
    mock_version.cook_time_minutes = None
    mock_version.tags = ["italian", "dinner"]
    mock_recipe.current_version = mock_version

    mock_task = MagicMock()
    mock_task.id = task_id
    mock_task.result_data = None

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=mock_task)
    mock_db.commit = AsyncMock()

    with (
        patch("app.services.recipe_import_service.async_session_factory") as mock_factory,
        patch("app.services.recipe_import_service.ai_service.import_recipe_from_url", return_value=fake_result),
        patch("app.services.recipe_import_service.recipe_service.create_recipe", return_value=(mock_recipe, mock_version)),
    ):
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.services.recipe_import_service import process_url_import
        await process_url_import(task_id, "https://example.com/recipe", user_id)

    assert mock_task.result_data is not None
    assert "recipe" in mock_task.result_data
    recipe_data = mock_task.result_data["recipe"]
    assert recipe_data["id"] == str(recipe_id)
    assert recipe_data["current_version"]["title"] == "Pasta Carbonara"
    assert len(recipe_data["current_version"]["ingredients"]) == 1
    assert len(recipe_data["current_version"]["steps"]) == 1
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py::test_process_url_import_embeds_result_data -v
```

Expected: FAIL — `mock_task.result_data` remains `None`.

- [ ] **Step 3: Update `process_url_import` to embed recipe data in `result_data`**

In `backend/app/services/recipe_import_service.py`, after `recipe, _ = await recipe_service.create_recipe(db, user_id, recipe_data)` and before setting `task.status`, add serialization of the full recipe response. Replace the completion block (lines 67–71):

```python
            recipe, version = await recipe_service.create_recipe(db, user_id, recipe_data)

            from app.schemas.recipe import RecipeResponse, RecipeVersionResponse
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
```

Note: `recipe_service.create_recipe` currently returns `(recipe, version)` — confirm the signature matches by checking `backend/app/services/recipe_service.py`. If it only returns `(recipe, _)` with `_` being something other than the version, fetch the version from `recipe.current_version_id` instead.

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py::test_process_url_import_embeds_result_data -v
```

Expected: PASS

- [ ] **Step 5: Repeat for `process_image_import`**

Apply the identical change to `process_image_import` in the same file (lines 142–149). After `recipe, version = await recipe_service.create_recipe(...)`:

```python
            recipe, version = await recipe_service.create_recipe(db, user_id, recipe_data)

            from app.schemas.recipe import RecipeResponse, RecipeVersionResponse
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
            logger.info(
                "process_image_import: task %s completed, recipe %s", task_id, recipe.id
            )
```

- [ ] **Step 6: Run the full unit test suite**

```bash
cd backend && pytest tests/unit/ -v
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/recipe_import_service.py backend/tests/unit/test_recipe_import_service.py
git commit -m "fix: embed full recipe data in import task result_data to prevent race condition"
```

---

### Task 2: Frontend — update `useImportPolling` to pass recipe data

**Files:**
- Modify: `frontend/src/composables/useImportPolling.ts`
- Modify: `frontend/src/types/importTask.ts`

- [ ] **Step 1: Extend the `ImportTask` type to include typed `result_data`**

In `frontend/src/types/importTask.ts`, replace the `result_data` field and add a `RecipeData` helper interface:

```typescript
export type ImportStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

export interface RecipeVersionData {
  id: string
  recipe_id: string
  version_number: number
  title: string
  description: string | null
  ingredients: Array<{ name: string; quantity: string | null; unit: string | null }>
  steps: Array<{ order: number; instruction: string }>
  servings: number
  prep_time_minutes: number | null
  waiting_time_minutes: number | null
  cook_time_minutes: number | null
  tags: string[]
  recipe_source: { type: string; url?: string } | null
  total_time_minutes: number | null
  created_at: string
}

export interface RecipeData {
  id: string
  owner_id: string
  visibility: 'private' | 'shared'
  current_version: RecipeVersionData
  created_at: string
  updated_at: string
}

export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  import_type: 'url' | 'image' | 'meal_suggestions'
  result_data: { recipe?: RecipeData } | null
  created_at: string
  updated_at: string
}

export interface ImportTaskCreated {
  task_id: string
  status: string
}
```

- [ ] **Step 2: Update `useImportPolling` to pass recipe data to callback**

Replace the full contents of `frontend/src/composables/useImportPolling.ts`:

```typescript
import { ref, onScopeDispose } from 'vue'
import * as importTasksApi from '@/api/importTasks'
import type { ImportStatus, RecipeData } from '@/types/importTask'

export function useImportPolling(
  onComplete: (recipeId: string, recipeData?: RecipeData) => void,
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
          onComplete(task.recipe_id, task.result_data?.recipe)
        } else if (task.status === 'failed') {
          stopPolling()
          error.value = task.error_message ?? 'Import failed'
        }
      } catch {
        stopPolling()
        error.value = 'Failed to check import status'
        status.value = 'failed'
      }
    }, 3000)
  }

  onScopeDispose(stopPolling)

  return { status, error, startPolling, stopPolling }
}
```

- [ ] **Step 3: Update `RecipeListView` to pass recipe data via router state**

In `frontend/src/views/RecipeListView.vue`, update the `useImportPolling` callback (lines 19–21):

```typescript
import type { RecipeData } from '@/types/importTask'

const { status: importStatus, error: importError, startPolling } = useImportPolling(
  (recipeId: string, recipeData?: RecipeData) => {
    router.push({
      name: 'recipe-edit',
      params: { id: recipeId },
      state: { importedRecipe: recipeData ?? null },
    })
  },
)
```

Also add the import at the top of the `<script setup>` block:

```typescript
import type { RecipeData } from '@/types/importTask'
```

- [ ] **Step 4: Update `RecipeEditView` to read from router state first**

Replace the full `<script setup>` block in `frontend/src/views/RecipeEditView.vue`:

```typescript
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import RecipeForm from '@/components/RecipeForm.vue'
import type { RecipeCreatePayload, RecipeUpdatePayload } from '@/types/recipe'
import type { RecipeData } from '@/types/importTask'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const userStore = useUserStore()
const error = ref('')
const ready = ref(false)

const recipeId = route.params.id as string

// Check for recipe data passed via router state (set by import polling on completion).
// This avoids a second API fetch that would race with the background task DB commit.
const importedRecipe = (history.state?.importedRecipe ?? null) as RecipeData | null

const initialData = computed<Partial<RecipeCreatePayload> | undefined>(() => {
  // Prefer imported data from router state; fall back to store fetch
  const source = importedRecipe ?? recipeStore.currentRecipe
  if (!source) return undefined
  const v = 'current_version' in source ? source.current_version : source.current_version
  return {
    title: v.title,
    description: v.description,
    ingredients: v.ingredients,
    steps: v.steps,
    servings: v.servings,
    prep_time_minutes: v.prep_time_minutes,
    waiting_time_minutes: v.waiting_time_minutes,
    cook_time_minutes: v.cook_time_minutes,
    tags: v.tags,
    recipe_source: v.recipe_source,
    visibility: 'visibility' in source ? source.visibility : recipeStore.currentRecipe?.visibility,
  }
})

onMounted(async () => {
  // If we have imported data in state, skip the fetch — data is already present.
  if (importedRecipe) {
    ready.value = true
    return
  }
  try {
    await recipeStore.fetchRecipe(recipeId)
    if (recipeStore.currentRecipe?.owner_id !== userStore.user?.id) {
      router.replace(`/recipes/${recipeId}`)
      return
    }
    ready.value = true
  } catch {
    router.replace('/recipes')
  }
})

async function handleSubmit(data: RecipeCreatePayload) {
  error.value = ''
  try {
    await recipeStore.updateRecipe(recipeId, data as RecipeUpdatePayload)
    router.push(`/recipes/${recipeId}`)
  } catch {
    error.value = 'Failed to save changes. Please try again.'
  }
}
```

- [ ] **Step 5: Run frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/composables/useImportPolling.ts frontend/src/types/importTask.ts frontend/src/views/RecipeListView.vue frontend/src/views/RecipeEditView.vue
git commit -m "fix: pass imported recipe data via router state to avoid race condition on edit view"
```

---

### Task 3: Tags — add "Choose from categories" label

**Files:**
- Modify: `frontend/src/components/TagSelector.vue`

- [ ] **Step 1: Add label to `TagSelector.vue`**

In `frontend/src/components/TagSelector.vue`, add a label above the tag groups. Replace the `<template>` block:

```html
<template>
  <div class="tag-selector">
    <p class="tag-selector__hint">Choose from categories</p>
    <fieldset v-for="group in TAG_GROUPS" :key="group.label" class="tag-selector__group">
      <legend class="tag-selector__legend">{{ group.label }}</legend>
      <div class="tag-selector__chips">
        <button
          v-for="tag in group.tags"
          :key="tag"
          type="button"
          class="tag-selector__chip"
          :class="{ 'tag-selector__chip--active': model.includes(tag) }"
          @click="toggle(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </fieldset>
  </div>
</template>
```

Add the style for `.tag-selector__hint` inside the `<style scoped>` block (after the last existing rule):

```css
.tag-selector__hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0 0 0.5rem;
}
```

- [ ] **Step 2: Run frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TagSelector.vue
git commit -m "fix: clarify tag selector is category-based, not free-text"
```

---

### Task 4: Run all tests

- [ ] **Step 1: Run backend tests**

```bash
cd backend && pytest --cov=app --cov-report=term-missing
```

Expected: All pass, coverage ≥ 80%.

- [ ] **Step 2: Run frontend unit tests**

```bash
cd frontend && npm run test:unit
```

Expected: All pass.
