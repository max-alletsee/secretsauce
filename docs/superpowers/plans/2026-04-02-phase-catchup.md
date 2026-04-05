# Phase Catch-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix scaffolding gaps, add TagFilter UI, and complete image import (backend + frontend) with temp-file cleanup.

**Architecture:** Six independent work areas executed sequentially by dependency. Backend model change (Task 5) must precede backend service/route tasks (Tasks 6-9). Frontend composable (Task 13) must precede RecipeListView refactor (Task 14). All other tasks are safe to execute in the written order.

**Tech Stack:** Python 3.12 / FastAPI / SQLModel / Alembic / Gemini `google-genai` SDK; Vue 3 / TypeScript / Pinia / Vitest / `@vue/test-utils`

---

## File Map

### New files
| File | Responsibility |
|------|----------------|
| `frontend/src/components/TagFilter.vue` | Grouped tag chips for recipe list filtering; clear-all + mobile collapsible |
| `frontend/src/components/TagFilter.test.ts` | Vitest unit tests for TagFilter |
| `frontend/src/composables/useImportPolling.ts` | Shared polling logic for import tasks |
| `frontend/src/composables/useImportPolling.test.ts` | Vitest unit tests for composable |
| `backend/app/tasks/cleanup.py` | Sync function to delete temp uploads older than 24 h |
| `backend/app/api/routes/admin.py` | Superuser-only admin endpoints; POST /admin/cleanup |
| `backend/tests/unit/test_cleanup.py` | Unit tests for cleanup function |
| `backend/tests/integration/test_admin_routes.py` | Integration tests for admin endpoints |

### Modified files
| File | Change |
|------|--------|
| `frontend/package.json` | Add `vuedraggable` dependency |
| `frontend/pnpm-lock.yaml` | Updated by `pnpm install` |
| `docker-compose.test.yml` | Replace `OPENROUTER_API_KEY` with `GEMINI_API_KEY` |
| `frontend/src/views/RecipeListView.vue` | Add TagFilter, image upload section; use `useImportPolling` |
| `frontend/src/views/RecipeListView.test.ts` | Add image upload tests; update mocks |
| `frontend/src/api/importTasks.ts` | Add `importRecipeFromImage()` |
| `frontend/src/types/importTask.ts` | Add `import_type` field |
| `backend/app/services/ai_service.py` | Add `_IMAGE_IMPORT_PROMPT_TEMPLATE` + `import_recipe_from_image()` |
| `backend/app/models/import_task.py` | Make `url` nullable; add `image_path` column |
| `backend/app/schemas/import_task.py` | Add `import_type` field to `ImportTaskRead` |
| `backend/app/services/recipe_import_service.py` | Add `process_image_import()` |
| `backend/app/api/routes/import_tasks.py` | Add `POST /recipes/import/image` route |
| `backend/app/main.py` | Add startup cleanup; register admin router |
| `backend/tests/unit/test_ai_service.py` | Add tests for `import_recipe_from_image` |
| `backend/tests/unit/test_recipe_import_service.py` | Add tests for `process_image_import` |
| `backend/tests/integration/test_import_routes.py` | Add tests for image import route |
| `backend/tests/conftest.py` | Add `superuser_token` fixture |

### Deleted files
| File | Reason |
|------|--------|
| `frontend/package-lock.json` | Project uses pnpm; only `pnpm-lock.yaml` should exist |

---

## Task 1: Frontend scaffolding — vuedraggable + lockfile cleanup

**Files:**
- Modify: `frontend/package.json`
- Delete: `frontend/package-lock.json`
- Modify: `frontend/pnpm-lock.yaml` (via pnpm install)

- [ ] **Step 1: Add vuedraggable to package.json**

Open `frontend/package.json`. In the `"dependencies"` block, add after the `"axios"` line:

```json
"vuedraggable": "^4.1.0",
```

The dependencies block should now include:
```json
"dependencies": {
  "@primevue/themes": "^4.5.4",
  "axios": "^1.13.6",
  "pinia": "^3.0.4",
  "primevue": "^4.5.4",
  "vue": "^3.5.29",
  "vue-router": "^5.0.3",
  "vuedraggable": "^4.1.0"
},
```

- [ ] **Step 2: Delete the npm lockfile**

```bash
rm frontend/package-lock.json
```

- [ ] **Step 3: Install dependencies to update pnpm lockfile**

```bash
cd frontend && pnpm install
```

Expected: pnpm resolves `vuedraggable` and updates `pnpm-lock.yaml`. No errors.

- [ ] **Step 4: Run existing frontend unit tests to confirm nothing broke**

```bash
cd frontend && npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git rm frontend/package-lock.json
git commit -m "chore: add vuedraggable, remove npm lockfile (project uses pnpm)"
```

---

## Task 2: Docker test compose — fix stale API key

**Files:**
- Modify: `docker-compose.test.yml`

- [ ] **Step 1: Replace the stale env var**

In `docker-compose.test.yml`, under the `backend.environment` block, replace:
```yaml
      OPENROUTER_API_KEY: sk-or-test-placeholder
```
with:
```yaml
      GEMINI_API_KEY: test-placeholder
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.test.yml
git commit -m "fix: replace stale OPENROUTER_API_KEY with GEMINI_API_KEY in test compose"
```

---

## Task 3: TagFilter component

**Files:**
- Create: `frontend/src/components/TagFilter.vue`
- Create: `frontend/src/components/TagFilter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/TagFilter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagFilter from './TagFilter.vue'

describe('TagFilter', () => {
  it('renders all tag group headings', () => {
    const wrapper = mount(TagFilter, { props: { modelValue: [] } })
    expect(wrapper.text()).toContain('Protein')
    expect(wrapper.text()).toContain('Diet')
    expect(wrapper.text()).toContain('Season')
    expect(wrapper.text()).toContain('Meal type')
    expect(wrapper.text()).toContain('Cuisine')
  })

  it('emits update:modelValue with selected tag when chip clicked', async () => {
    const wrapper = mount(TagFilter, { props: { modelValue: [] } })
    const chip = wrapper.find('[data-testid="tag-chip-italian"]')
    await chip.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect((emitted![0][0] as string[]).includes('italian')).toBe(true)
  })

  it('emits update:modelValue without tag when active chip clicked (deselect)', async () => {
    const wrapper = mount(TagFilter, { props: { modelValue: ['italian'] } })
    const chip = wrapper.find('[data-testid="tag-chip-italian"]')
    await chip.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect((emitted![0][0] as string[]).includes('italian')).toBe(false)
  })

  it('does not show clear-all button when no tags selected', () => {
    const wrapper = mount(TagFilter, { props: { modelValue: [] } })
    expect(wrapper.find('[data-testid="tag-filter-clear"]').exists()).toBe(false)
  })

  it('shows clear-all button when tags are selected', () => {
    const wrapper = mount(TagFilter, { props: { modelValue: ['italian'] } })
    expect(wrapper.find('[data-testid="tag-filter-clear"]').exists()).toBe(true)
  })

  it('emits empty array when clear-all clicked', async () => {
    const wrapper = mount(TagFilter, { props: { modelValue: ['italian', 'dinner'] } })
    await wrapper.find('[data-testid="tag-filter-clear"]').trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual([])
  })

  it('shows toggle button on mobile (always present in DOM)', () => {
    const wrapper = mount(TagFilter, { props: { modelValue: [] } })
    expect(wrapper.find('[data-testid="tag-filter-toggle"]').exists()).toBe(true)
  })

  it('shows active count in toggle button when tags selected', () => {
    const wrapper = mount(TagFilter, { props: { modelValue: ['italian', 'vegan'] } })
    const toggle = wrapper.find('[data-testid="tag-filter-toggle"]')
    expect(toggle.text()).toContain('2')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/TagFilter.test.ts
```

Expected: FAIL — `TagFilter.vue` not found.

- [ ] **Step 3: Create TagFilter.vue**

Create `frontend/src/components/TagFilter.vue`:

```vue
<!-- frontend/src/components/TagFilter.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const model = defineModel<string[]>({ default: () => [] })

const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: 'Protein', tags: ['vegan', 'vegetarian', 'fish', 'poultry', 'meat', 'seafood'] },
  {
    label: 'Diet',
    tags: [
      'low-calorie', 'high-calorie', 'low-carb', 'high-protein',
      'gluten-free', 'dairy-free', 'keto', 'paleo', 'mediterranean',
    ],
  },
  { label: 'Season', tags: ['spring', 'summer', 'autumn', 'winter'] },
  { label: 'Meal type', tags: ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] },
  {
    label: 'Cuisine',
    tags: [
      'italian', 'mexican', 'japanese', 'chinese', 'indian',
      'thai', 'french', 'greek', 'middle-eastern', 'american', 'korean',
    ],
  },
]

const expanded = ref(false)

function toggle(tag: string) {
  if (model.value.includes(tag)) {
    model.value = model.value.filter((t) => t !== tag)
  } else {
    model.value = [...model.value, tag]
  }
}

function clearAll() {
  model.value = []
}
</script>

<template>
  <div class="tag-filter">
    <!-- Mobile toggle -->
    <button
      type="button"
      data-testid="tag-filter-toggle"
      class="tag-filter__toggle"
      @click="expanded = !expanded"
    >
      Filter
      <span v-if="model.length" class="tag-filter__badge">{{ model.length }}</span>
      <span class="tag-filter__arrow">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <div class="tag-filter__panel" :class="{ 'tag-filter__panel--open': expanded }">
      <button
        v-if="model.length"
        type="button"
        data-testid="tag-filter-clear"
        class="tag-filter__clear"
        @click="clearAll"
      >
        Clear all
      </button>

      <fieldset v-for="group in TAG_GROUPS" :key="group.label" class="tag-filter__group">
        <legend class="tag-filter__legend">{{ group.label }}</legend>
        <div class="tag-filter__chips">
          <button
            v-for="tag in group.tags"
            :key="tag"
            type="button"
            :data-testid="`tag-chip-${tag}`"
            class="tag-filter__chip"
            :class="{ 'tag-filter__chip--active': model.includes(tag) }"
            @click="toggle(tag)"
          >
            {{ tag }}
          </button>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.tag-filter__toggle {
  display: none;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  font-size: 0.875rem;
  cursor: pointer;
}
.tag-filter__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  background: #2563eb;
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
}
.tag-filter__arrow {
  font-size: 0.625rem;
  color: #6b7280;
}
/* Mobile: toggle visible, panel hidden unless open */
@media (max-width: 767px) {
  .tag-filter__toggle {
    display: flex;
  }
  .tag-filter__panel {
    display: none;
  }
  .tag-filter__panel--open {
    display: block;
  }
}
.tag-filter__clear {
  margin-bottom: 0.5rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  font-size: 0.8125rem;
  color: #374151;
  cursor: pointer;
}
.tag-filter__group {
  border: none;
  padding: 0;
  margin: 0 0 0.75rem;
}
.tag-filter__legend {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.375rem;
}
.tag-filter__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.tag-filter__chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 1rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.1s;
}
.tag-filter__chip--active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}
</style>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/TagFilter.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TagFilter.vue frontend/src/components/TagFilter.test.ts
git commit -m "feat: add TagFilter component with grouped chips, clear-all, and mobile collapsible"
```

---

## Task 4: Wire TagFilter into RecipeListView

**Files:**
- Modify: `frontend/src/views/RecipeListView.vue`

Note: This task only adds the TagFilter visually. The selected tags are not wired to any API call — that is Phase 4 work.

- [ ] **Step 1: Add the import and selectedTags ref to the script section**

In `frontend/src/views/RecipeListView.vue`, update the `<script setup>` section.

Add after the existing imports:
```typescript
import TagFilter from '@/components/TagFilter.vue'
```

Add after the `const router = useRouter()` line:
```typescript
const selectedTags = ref<string[]>([])
```

- [ ] **Step 2: Add TagFilter to the template**

In the `<template>` section, add the TagFilter between the import section and the recipe grid/loading state. Replace the line:
```html
    <p v-if="recipeStore.loading && !recipeStore.recipes.length" class="recipe-list-page__loading">
```

with:
```html
    <TagFilter v-model="selectedTags" class="recipe-list-page__filters" />

    <p v-if="recipeStore.loading && !recipeStore.recipes.length" class="recipe-list-page__loading">
```

- [ ] **Step 3: Add spacing style for the filter**

In the `<style scoped>` section, add after `.import-section__error`:
```css
.recipe-list-page__filters {
  margin-bottom: 1.5rem;
}
```

- [ ] **Step 4: Run all frontend tests to confirm nothing broke**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass (TagFilter renders but is not interacted with in existing tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/RecipeListView.vue
git commit -m "feat: add TagFilter to RecipeListView (visual only, Phase 4 will wire to API)"
```

---

## Task 5: Update ImportTask model + Alembic migration

**Files:**
- Modify: `backend/app/models/import_task.py`
- Create: `backend/alembic/versions/<hash>_make_url_nullable_add_image_path.py` (via autogenerate)

- [ ] **Step 1: Update the ImportTask model**

In `backend/app/models/import_task.py`, replace the `url` field definition:

```python
    url: str = Field(sa_column=Column(Text, nullable=False))
```

with:

```python
    url: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
```

Then add `image_path` after the `url` field:

```python
    image_path: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
```

The full model file should now look like:

```python
# backend/app/models/import_task.py
import uuid
from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Uuid
from sqlmodel import Field, SQLModel


class ImportTaskStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportTask(SQLModel, table=True):
    __tablename__ = "import_tasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_import_tasks_user_id"),
            nullable=False,
            index=True,
        )
    )
    url: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    image_path: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    status: ImportTaskStatus = Field(
        default=ImportTaskStatus.PENDING,
        sa_column=Column(String(20), nullable=False, server_default="pending"),
    )
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_import_tasks_recipe_id"),
            nullable=True,
        ),
    )
    error_message: str | None = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            onupdate=lambda: datetime.now(timezone.utc),
        ),
    )
```

- [ ] **Step 2: Generate the migration**

```bash
cd backend && alembic revision --autogenerate -m "make_url_nullable_add_image_path"
```

Expected: a new file created in `alembic/versions/` with content similar to:

```python
def upgrade() -> None:
    op.alter_column('import_tasks', 'url', existing_type=sa.Text(), nullable=True)
    op.add_column('import_tasks', sa.Column('image_path', sa.Text(), nullable=True))

def downgrade() -> None:
    op.drop_column('import_tasks', 'image_path')
    op.alter_column('import_tasks', 'url', existing_type=sa.Text(), nullable=False)
```

Open the generated file and verify it contains these two operations. If autogenerate produced anything unexpected, correct it manually.

- [ ] **Step 3: Apply the migration**

```bash
cd backend && alembic upgrade head
```

Expected: migration runs without error.

- [ ] **Step 4: Verify existing backend tests still pass**

```bash
cd backend && pytest tests/ -x -q
```

Expected: all tests pass (the test DB uses `SQLModel.metadata.create_all` which picks up the updated model).

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/import_task.py backend/alembic/versions/
git commit -m "feat: make import_task.url nullable, add image_path column"
```

---

## Task 6: AI service — import_recipe_from_image

**Files:**
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/tests/unit/test_ai_service.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_ai_service.py` (append after the existing tests):

```python
from app.services.ai_service import import_recipe_from_image


@pytest.mark.asyncio
async def test_import_recipe_from_image_success():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    image_bytes = b'\xff\xd8\xff\xe0' + b'\x00' * 16  # minimal JPEG-like bytes
    with patch("app.services.ai_service._client", mock_client):
        result = await import_recipe_from_image(image_bytes, "image/jpeg")
    assert result.title == "Pasta"
    assert len(result.ingredients) == 1


@pytest.mark.asyncio
async def test_import_recipe_from_image_retries_on_transient_failure():
    mock_response = MagicMock()
    mock_response.text = _VALID_RESULT.model_dump_json()
    mock_response.usage_metadata = None
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=[Exception("network error"), mock_response]
    )
    image_bytes = b'\x00' * 32
    with patch("app.services.ai_service._client", mock_client):
        with patch("app.services.ai_service.asyncio.sleep", AsyncMock()) as mock_sleep:
            result = await import_recipe_from_image(image_bytes, "image/jpeg")
    assert result.title == "Pasta"
    assert mock_client.aio.models.generate_content.call_count == 2
    assert mock_sleep.call_count == 1


@pytest.mark.asyncio
async def test_import_recipe_from_image_raises_after_max_retries():
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("persistent error")
    )
    with patch("app.services.ai_service._client", mock_client):
        with patch("app.services.ai_service.asyncio.sleep", AsyncMock()):
            with pytest.raises(AIServiceError, match="Import failed after"):
                await import_recipe_from_image(b'\x00' * 32, "image/jpeg")


@pytest.mark.asyncio
async def test_import_recipe_from_image_passes_bytes_as_inline_content():
    mock_client = _make_mock_client(_VALID_RESULT.model_dump_json())
    image_bytes = b'\xff\xd8\xff\xe0' + b'\x00' * 16
    with patch("app.services.ai_service._client", mock_client):
        await import_recipe_from_image(image_bytes, "image/jpeg")
    call_args = mock_client.aio.models.generate_content.call_args
    # contents must be a list containing an image Part
    contents = call_args.kwargs.get("contents") or call_args.args[1]
    assert isinstance(contents, list)
    # At least one element should be a types.Part (from_bytes creates a Part)
    from google.genai import types as genai_types
    assert any(isinstance(item, genai_types.Part) for item in contents)
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && pytest tests/unit/test_ai_service.py::test_import_recipe_from_image_success -v
```

Expected: FAIL — `cannot import name 'import_recipe_from_image'`.

- [ ] **Step 3: Implement import_recipe_from_image in ai_service.py**

In `backend/app/services/ai_service.py`, add the image prompt template constant after `_IMPORT_PROMPT_TEMPLATE`:

```python
_IMAGE_IMPORT_PROMPT_TEMPLATE = (
    "Extract the complete recipe from this image.\n\n"
    "The image may be a photographed cookbook page, a handwritten recipe card, "
    "a screenshot of a recipe website, or a photo that includes recipe text. "
    "Do your best to extract all available information even if the image is "
    "partially blurry, cropped, or handwritten.\n\n"
    "Extract: title, description (if visible), all ingredients with quantities and "
    "units, all numbered steps, servings, prep/cook/waiting times in minutes. "
    "For tags, only use values from this exact list: "
    "vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, "
    "low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, "
    "spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, "
    "italian, mexican, japanese, chinese, indian, thai, french, greek, "
    "middle-eastern, american, korean. "
    "If a field cannot be determined from the image, omit it."
)
```

Then add the `import_recipe_from_image` function after `import_recipe_from_url`:

```python
async def import_recipe_from_image(image_bytes: bytes, mime_type: str) -> RecipeImportResult:
    """Call Gemini with inline image bytes to extract a recipe.

    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    last_error: Exception | None = None

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                        _IMAGE_IMPORT_PROMPT_TEMPLATE,
                    ],
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
                "AI image import success | model=%s mime=%s latency=%.2fs tokens_in=%d tokens_out=%d",
                settings.AI_MODEL,
                mime_type,
                elapsed,
                usage.prompt_token_count if usage else 0,
                usage.candidates_token_count if usage else 0,
            )
            return RecipeImportResult.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI image import attempt %d/%d failed | mime=%s latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                mime_type,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    raise AIServiceError(
        f"Import failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error
```

- [ ] **Step 4: Run the new tests to confirm they pass**

```bash
cd backend && pytest tests/unit/test_ai_service.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_service.py backend/tests/unit/test_ai_service.py
git commit -m "feat: add import_recipe_from_image to ai_service with separate image prompt"
```

---

## Task 7: Import service — process_image_import

**Files:**
- Modify: `backend/app/services/recipe_import_service.py`
- Modify: `backend/tests/unit/test_recipe_import_service.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_recipe_import_service.py` (append after existing tests):

```python
from app.services.recipe_import_service import process_image_import
import pathlib


@pytest.mark.asyncio
async def test_process_image_import_happy_path(tmp_path):
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    recipe_id = uuid.uuid4()

    # Write a fake image file
    image_file = tmp_path / "test.jpg"
    image_file.write_bytes(b'\xff\xd8\xff\xe0' + b'\x00' * 16)

    mock_task = MagicMock(spec=ImportTask)
    mock_recipe = MagicMock()
    mock_recipe.id = recipe_id
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_image",
            AsyncMock(return_value=_valid_result()),
        ):
            with patch(
                "app.services.recipe_import_service.recipe_service.create_recipe",
                AsyncMock(return_value=(mock_recipe, MagicMock())),
            ):
                await process_image_import(task_id, str(image_file), user_id)

    assert mock_task.status == ImportTaskStatus.COMPLETED
    assert mock_task.recipe_id == recipe_id


@pytest.mark.asyncio
async def test_process_image_import_sets_failed_on_ai_error(tmp_path):
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    image_file = tmp_path / "test.jpg"
    image_file.write_bytes(b'\xff\xd8\xff\xe0' + b'\x00' * 16)

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_image",
            AsyncMock(side_effect=AIServiceError("Gemini image timeout")),
        ):
            await process_image_import(task_id, str(image_file), user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "Gemini image timeout" in mock_task.error_message


@pytest.mark.asyncio
async def test_process_image_import_fails_on_empty_ingredients(tmp_path):
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    image_file = tmp_path / "test.jpg"
    image_file.write_bytes(b'\x00' * 32)

    no_ingredients = RecipeImportResult(
        title="Pasta",
        ingredients=[],
        steps=[ImportedStep(order=1, instruction="Cook pasta")],
        recipe_source=ImportedRecipeSource(type="url", url="https://example.com"),
    )

    mock_task = MagicMock(spec=ImportTask)
    mock_db, mock_session_ctx = _make_db_and_session_ctx(mock_task)

    with patch(
        "app.services.recipe_import_service.async_session_factory",
        return_value=mock_session_ctx,
    ):
        with patch(
            "app.services.recipe_import_service.ai_service.import_recipe_from_image",
            AsyncMock(return_value=no_ingredients),
        ):
            await process_image_import(task_id, str(image_file), user_id)

    assert mock_task.status == ImportTaskStatus.FAILED
    assert "no ingredients" in mock_task.error_message
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py::test_process_image_import_happy_path -v
```

Expected: FAIL — `cannot import name 'process_image_import'`.

- [ ] **Step 3: Implement process_image_import**

Add the following imports at the top of `backend/app/services/recipe_import_service.py` (after existing imports):

```python
import mimetypes
import pathlib
```

Then append `process_image_import` after `process_url_import`:

```python
async def process_image_import(task_id: uuid.UUID, image_path: str, user_id: uuid.UUID) -> None:
    """Background task: read image file, call Gemini to extract recipe, save, update task.

    Creates its own AsyncSession because BackgroundTasks run after the request session closes.
    """
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
            image_bytes = pathlib.Path(image_path).read_bytes()
            mime_type, _ = mimetypes.guess_type(image_path)
            if mime_type is None:
                mime_type = "image/jpeg"

            result: RecipeImportResult = await ai_service.import_recipe_from_image(
                image_bytes, mime_type
            )

            if not result.title:
                raise ValueError("Extracted recipe has no title")
            if not result.ingredients:
                raise ValueError("Extracted recipe has no ingredients")
            if not result.steps:
                raise ValueError("Extracted recipe has no steps")

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

            recipe, _ = await recipe_service.create_recipe(db, user_id, recipe_data)

            task.status = ImportTaskStatus.COMPLETED
            task.recipe_id = recipe.id
            task.updated_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.error("Image import task %s failed: %s", task_id, exc)
            task.status = ImportTaskStatus.FAILED
            task.error_message = str(exc)
            task.updated_at = datetime.now(timezone.utc)

        db.add(task)
        await db.commit()
```

- [ ] **Step 4: Run all import service tests**

```bash
cd backend && pytest tests/unit/test_recipe_import_service.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/recipe_import_service.py backend/tests/unit/test_recipe_import_service.py
git commit -m "feat: add process_image_import to recipe_import_service"
```

---

## Task 8: Update backend schemas for image import

**Files:**
- Modify: `backend/app/schemas/import_task.py`

- [ ] **Step 1: Add import_type to ImportTaskRead**

Replace the entire contents of `backend/app/schemas/import_task.py` with:

```python
# backend/app/schemas/import_task.py
import uuid
from datetime import datetime
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict

from app.models.import_task import ImportTaskStatus


class RecipeImportURLRequest(BaseModel):
    url: AnyHttpUrl


class ImportTaskCreated(BaseModel):
    task_id: uuid.UUID
    status: ImportTaskStatus


class ImportTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ImportTaskStatus
    recipe_id: uuid.UUID | None
    error_message: str | None
    import_type: Literal["url", "image"]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_task(cls, task) -> "ImportTaskRead":
        return cls(
            id=task.id,
            status=task.status,
            recipe_id=task.recipe_id,
            error_message=task.error_message,
            import_type="image" if task.image_path is not None else "url",
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
```

- [ ] **Step 2: Update the get_import_task route to use from_orm_task**

In `backend/app/api/routes/import_tasks.py`, update the `get_import_task` handler. Replace:

```python
    return ImportTaskRead.model_validate(task)
```

with:

```python
    return ImportTaskRead.from_orm_task(task)
```

- [ ] **Step 3: Update the existing integration test to accept the new field**

In `backend/tests/integration/test_import_routes.py`, find `test_get_import_task_returns_task_for_owner` and add after `assert data["error_message"] is None`:

```python
    assert data["import_type"] == "url"
```

- [ ] **Step 4: Run the import route tests**

```bash
cd backend && pytest tests/integration/test_import_routes.py -v
```

Expected: all existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/import_task.py backend/app/api/routes/import_tasks.py backend/tests/integration/test_import_routes.py
git commit -m "feat: add import_type field to ImportTaskRead schema"
```

---

## Task 9: Image import route

**Files:**
- Modify: `backend/app/api/routes/import_tasks.py`
- Modify: `backend/tests/integration/test_import_routes.py`

- [ ] **Step 1: Write the failing integration tests**

Add to the end of `backend/tests/integration/test_import_routes.py`:

```python
# ── POST /api/v1/recipes/import/image ────────────────────────────────────────

_MINIMAL_JPEG = b'\xff\xd8\xff\xe0' + b'\x00' * 16  # valid JPEG magic bytes


async def test_import_image_requires_auth(client):
    r = await client.post(
        "/api/v1/recipes/import/image",
        files={"file": ("test.jpg", _MINIMAL_JPEG, "image/jpeg")},
    )
    assert r.status_code == 401


async def test_import_image_rejects_non_image_content_type(client):
    token = await _auth_token(client)
    r = await client.post(
        "/api/v1/recipes/import/image",
        files={"file": ("test.txt", b"hello world", "text/plain")},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_import_image_rejects_oversized_file(client):
    token = await _auth_token(client)
    big_bytes = b'\xff\xd8\xff\xe0' + b'\x00' * (10 * 1024 * 1024 + 1)  # 10 MB + 1 byte
    r = await client.post(
        "/api/v1/recipes/import/image",
        files={"file": ("big.jpg", big_bytes, "image/jpeg")},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_import_image_returns_202_and_creates_task(client, tmp_path, monkeypatch):
    token = await _auth_token(client)
    # Redirect UPLOAD_DIR to a temp path so no real disk writes pollute the test env
    monkeypatch.setattr("app.api.routes.import_tasks.settings.UPLOAD_DIR", str(tmp_path))

    with patch("app.api.routes.import_tasks.process_image_import", AsyncMock()):
        r = await client.post(
            "/api/v1/recipes/import/image",
            files={"file": ("recipe.jpg", _MINIMAL_JPEG, "image/jpeg")},
            headers=_auth(token),
        )
    assert r.status_code == 202
    data = r.json()
    assert "task_id" in data
    assert data["status"] == "pending"
    uuid.UUID(data["task_id"])


async def test_import_image_task_has_image_type(client, tmp_path, monkeypatch):
    token = await _auth_token(client)
    monkeypatch.setattr("app.api.routes.import_tasks.settings.UPLOAD_DIR", str(tmp_path))

    with patch("app.api.routes.import_tasks.process_image_import", AsyncMock()):
        post = await client.post(
            "/api/v1/recipes/import/image",
            files={"file": ("recipe.jpg", _MINIMAL_JPEG, "image/jpeg")},
            headers=_auth(token),
        )
    task_id = post.json()["task_id"]

    r = await client.get(f"/api/v1/import-tasks/{task_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["import_type"] == "image"
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && pytest tests/integration/test_import_routes.py::test_import_image_requires_auth -v
```

Expected: FAIL — route does not exist (404).

- [ ] **Step 3: Add required imports to import_tasks.py**

At the top of `backend/app/api/routes/import_tasks.py`, add to the existing imports:

```python
import asyncio
import uuid as uuid_lib
from pathlib import Path

from fastapi import File, HTTPException, UploadFile

from app.core.config import settings
from app.services.recipe_import_service import process_image_import
```

The full import block at the top of `import_tasks.py` should be:

```python
import asyncio
import uuid
import uuid as uuid_lib
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.core.rate_limit import check_import_rate_limit
from app.core.security import current_active_user
from app.models.import_task import ImportTask, ImportTaskStatus
from app.models.user import User
from app.schemas.import_task import ImportTaskCreated, ImportTaskRead, RecipeImportURLRequest
from app.services.recipe_import_service import process_image_import, process_url_import
```

- [ ] **Step 4: Add the image import route**

In `backend/app/api/routes/import_tasks.py`, append to `recipes_router` after the existing `import_recipe_from_url` route:

```python
_MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


@recipes_router.post("/import/image", status_code=202, response_model=ImportTaskCreated)
async def import_recipe_from_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ImportTaskCreated:
    check_import_rate_limit(str(user.id))

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="File must be an image")

    content = await file.read()
    if len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="File too large (max 10 MB)")

    ext = Path(file.filename or "upload").suffix or ".jpg"
    dest_path = Path(settings.UPLOAD_DIR) / f"{uuid_lib.uuid4()}{ext}"
    await asyncio.to_thread(lambda: (dest_path.parent.mkdir(parents=True, exist_ok=True), dest_path.write_bytes(content)))

    task = ImportTask(user_id=user.id, image_path=str(dest_path))
    db.add(task)
    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(process_image_import, task.id, str(dest_path), user.id)
    return ImportTaskCreated(task_id=task.id, status=ImportTaskStatus.PENDING)
```

- [ ] **Step 5: Run all import route tests**

```bash
cd backend && pytest tests/integration/test_import_routes.py -v
```

Expected: all 11 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/import_tasks.py backend/tests/integration/test_import_routes.py
git commit -m "feat: add POST /api/v1/recipes/import/image endpoint"
```

---

## Task 10: Temp file cleanup + admin route

**Files:**
- Create: `backend/app/tasks/cleanup.py`
- Create: `backend/app/api/routes/admin.py`
- Create: `backend/tests/unit/test_cleanup.py`
- Create: `backend/tests/integration/test_admin_routes.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Write the cleanup unit tests**

Create `backend/tests/unit/test_cleanup.py`:

```python
# backend/tests/unit/test_cleanup.py
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.tasks.cleanup import cleanup_old_uploads


def _touch(path: Path, age_seconds: int) -> None:
    """Create file and set its mtime to age_seconds in the past."""
    path.write_bytes(b"data")
    old_mtime = time.time() - age_seconds
    import os
    os.utime(path, (old_mtime, old_mtime))


def test_cleanup_deletes_files_older_than_24h(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.cleanup.settings.UPLOAD_DIR", str(tmp_path))
    old_file = tmp_path / "old.jpg"
    _touch(old_file, age_seconds=25 * 3600)  # 25 hours old

    deleted = cleanup_old_uploads()

    assert deleted == 1
    assert not old_file.exists()


def test_cleanup_keeps_recent_files(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.cleanup.settings.UPLOAD_DIR", str(tmp_path))
    recent_file = tmp_path / "recent.jpg"
    _touch(recent_file, age_seconds=3600)  # 1 hour old

    deleted = cleanup_old_uploads()

    assert deleted == 0
    assert recent_file.exists()


def test_cleanup_returns_correct_count(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.cleanup.settings.UPLOAD_DIR", str(tmp_path))
    for i in range(3):
        _touch(tmp_path / f"old_{i}.jpg", age_seconds=25 * 3600)
    _touch(tmp_path / "recent.jpg", age_seconds=3600)

    deleted = cleanup_old_uploads()

    assert deleted == 3


def test_cleanup_returns_zero_when_dir_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.tasks.cleanup.settings.UPLOAD_DIR",
        str(tmp_path / "nonexistent"),
    )
    deleted = cleanup_old_uploads()
    assert deleted == 0
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd backend && pytest tests/unit/test_cleanup.py -v
```

Expected: FAIL — `app.tasks.cleanup` not found.

- [ ] **Step 3: Create cleanup.py**

Create `backend/app/tasks/cleanup.py`:

```python
# backend/app/tasks/cleanup.py
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

_MAX_AGE = timedelta(hours=24)


def cleanup_old_uploads() -> int:
    """Delete files in UPLOAD_DIR older than 24 hours. Returns count of deleted files."""
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.exists():
        return 0

    cutoff = datetime.now(timezone.utc) - _MAX_AGE
    deleted = 0

    for path in upload_dir.iterdir():
        if not path.is_file():
            continue
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff:
            try:
                path.unlink()
                deleted += 1
                logger.debug("Deleted old upload: %s", path)
            except OSError as exc:
                logger.warning("Failed to delete %s: %s", path, exc)

    if deleted:
        logger.info("Startup cleanup: deleted %d old upload file(s)", deleted)
    return deleted
```

- [ ] **Step 4: Run cleanup unit tests**

```bash
cd backend && pytest tests/unit/test_cleanup.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Add superuser_token fixture to conftest**

In `backend/tests/conftest.py`, add these imports at the top:

```python
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
```

Then append this fixture at the bottom:

```python
@pytest.fixture
async def superuser_token(client, db_engine) -> str:
    """Create a user, promote to superuser via DB, return access token."""
    from app.models.user import User as UserModel

    email = unique_email("superuser")
    password = "SuperPass123!"

    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.json()
    user_id = reg.json()["id"]

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        await session.execute(
            update(UserModel)
            .where(UserModel.id == uuid.UUID(user_id))
            .values(is_superuser=True)
        )
        await session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return login.json()["access_token"]
```

- [ ] **Step 6: Write admin route integration tests**

Create `backend/tests/integration/test_admin_routes.py`:

```python
# backend/tests/integration/test_admin_routes.py
from unittest.mock import patch

import pytest

from tests.conftest import unique_email


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _regular_token(client) -> str:
    email = unique_email("regular")
    password = "RegularPass123!"
    await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    r = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return r.json()["access_token"]


async def test_admin_cleanup_requires_auth(client):
    r = await client.post("/api/v1/admin/cleanup")
    assert r.status_code == 401


async def test_admin_cleanup_requires_superuser(client):
    token = await _regular_token(client)
    r = await client.post("/api/v1/admin/cleanup", headers=_auth(token))
    assert r.status_code == 403


async def test_admin_cleanup_returns_deleted_count(client, superuser_token):
    with patch("app.api.routes.admin.cleanup_old_uploads", return_value=7):
        r = await client.post("/api/v1/admin/cleanup", headers=_auth(superuser_token))
    assert r.status_code == 200
    assert r.json()["deleted_count"] == 7
```

- [ ] **Step 7: Run to confirm admin tests fail**

```bash
cd backend && pytest tests/integration/test_admin_routes.py -v
```

Expected: FAIL — no route at `/api/v1/admin/cleanup`.

- [ ] **Step 8: Create admin.py**

Create `backend/app/api/routes/admin.py`:

```python
# backend/app/api/routes/admin.py
import asyncio

from fastapi import APIRouter, Depends

from app.core.security import current_superuser
from app.models.user import User
from app.tasks.cleanup import cleanup_old_uploads

router = APIRouter()


@router.post("/cleanup")
async def trigger_cleanup(
    _user: User = Depends(current_superuser),
) -> dict:
    """Delete temp upload files older than 24 hours. Superuser only."""
    deleted_count = await asyncio.to_thread(cleanup_old_uploads)
    return {"deleted_count": deleted_count}
```

- [ ] **Step 9: Register admin router and startup cleanup in main.py**

In `backend/app/main.py`, add these imports after the existing imports:

```python
import asyncio

from app.api.routes import admin
from app.tasks.cleanup import cleanup_old_uploads
```

Replace the lifespan function:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(cleanup_old_uploads)
    yield
```

After the existing `app.include_router(import_tasks_router, ...)` line, add:

```python
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
```

- [ ] **Step 10: Run all backend tests**

```bash
cd backend && pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/app/tasks/cleanup.py backend/app/api/routes/admin.py backend/app/main.py backend/tests/unit/test_cleanup.py backend/tests/integration/test_admin_routes.py backend/tests/conftest.py
git commit -m "feat: add temp file cleanup on startup and POST /api/v1/admin/cleanup endpoint"
```

---

## Task 11: Frontend types update

**Files:**
- Modify: `frontend/src/types/importTask.ts`

- [ ] **Step 1: Add import_type to the ImportTask interface**

Replace the entire contents of `frontend/src/types/importTask.ts` with:

```typescript
// frontend/src/types/importTask.ts

export type ImportStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  import_type: 'url' | 'image'
  created_at: string
  updated_at: string
}

export interface ImportTaskCreated {
  task_id: string
  status: string
}
```

Note: `ImportStatus` is exported for use in the composable (Task 13).

- [ ] **Step 2: Run frontend tests to confirm no type breakage**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/importTask.ts
git commit -m "feat: add import_type field and ImportStatus type to importTask types"
```

---

## Task 12: Add importRecipeFromImage API function

**Files:**
- Modify: `frontend/src/api/importTasks.ts`

- [ ] **Step 1: Add the image import function**

Replace the entire contents of `frontend/src/api/importTasks.ts` with:

```typescript
// frontend/src/api/importTasks.ts
import client from './client'
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'

export const importRecipeFromUrl = (url: string) =>
  client.post<ImportTaskCreated>('/recipes/import/url', { url })

export const importRecipeFromImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return client.post<ImportTaskCreated>('/recipes/import/image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const getImportTask = (taskId: string) =>
  client.get<ImportTask>(`/import-tasks/${taskId}`)
```

- [ ] **Step 2: Update the RecipeListView test mock to include the new function**

In `frontend/src/views/RecipeListView.test.ts`, find the mock block:

```typescript
vi.mock('@/api/importTasks', () => ({
  importRecipeFromUrl: vi.fn(),
  getImportTask: vi.fn(),
}))
```

Replace with:

```typescript
vi.mock('@/api/importTasks', () => ({
  importRecipeFromUrl: vi.fn(),
  importRecipeFromImage: vi.fn(),
  getImportTask: vi.fn(),
}))
```

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/importTasks.ts frontend/src/views/RecipeListView.test.ts
git commit -m "feat: add importRecipeFromImage API function"
```

---

## Task 13: useImportPolling composable

**Files:**
- Create: `frontend/src/composables/useImportPolling.ts`
- Create: `frontend/src/composables/useImportPolling.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/composables/useImportPolling.test.ts`:

```typescript
// frontend/src/composables/useImportPolling.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import type { AxiosResponse } from 'axios'
import type { ImportTask } from '@/types/importTask'

vi.mock('@/api/importTasks', () => ({
  getImportTask: vi.fn(),
}))

import * as importTasksApi from '@/api/importTasks'
import { useImportPolling } from './useImportPolling'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

function makeTask(overrides: Partial<ImportTask> = {}): ImportTask {
  return {
    id: 'task-1',
    status: 'pending',
    recipe_id: null,
    error_message: null,
    import_type: 'url',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('useImportPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with idle status', () => {
    const scope = effectScope()
    scope.run(() => {
      const { status } = useImportPolling(() => {})
      expect(status.value).toBe('idle')
    })
    scope.stop()
  })

  it('starts with null error', () => {
    const scope = effectScope()
    scope.run(() => {
      const { error } = useImportPolling(() => {})
      expect(error.value).toBeNull()
    })
    scope.stop()
  })

  it('sets status to pending immediately when startPolling called', () => {
    const scope = effectScope()
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'processing' })),
      )
      const { status, startPolling } = useImportPolling(() => {})
      startPolling('task-1')
      expect(status.value).toBe('pending')
    })
    scope.stop()
  })

  it('calls onComplete with recipeId when task completes', async () => {
    const onComplete = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'completed', recipe_id: 'recipe-42' })),
      )
      const { startPolling } = useImportPolling(onComplete)
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(onComplete).toHaveBeenCalledWith('recipe-42')
    scope.stop()
  })

  it('sets error and failed status when task fails', async () => {
    const scope = effectScope()
    let capturedError: any
    let capturedStatus: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'failed', error_message: 'Gemini timed out' })),
      )
      const { status, error, startPolling } = useImportPolling(() => {})
      capturedError = error
      capturedStatus = status
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedError.value).toBe('Gemini timed out')
    expect(capturedStatus.value).toBe('failed')
    scope.stop()
  })

  it('uses default error message when task.error_message is null', async () => {
    const scope = effectScope()
    let capturedError: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'failed', error_message: null })),
      )
      const { error, startPolling } = useImportPolling(() => {})
      capturedError = error
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedError.value).toBe('Import failed')
    scope.stop()
  })

  it('sets error when polling API call throws', async () => {
    const scope = effectScope()
    let capturedError: any
    let capturedStatus: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockRejectedValue(new Error('network'))
      const { status, error, startPolling } = useImportPolling(() => {})
      capturedError = error
      capturedStatus = status
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedError.value).toBe('Failed to check import status')
    expect(capturedStatus.value).toBe('failed')
    scope.stop()
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd frontend && npx vitest run src/composables/useImportPolling.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the composable**

Create `frontend/src/composables/useImportPolling.ts`:

```typescript
// frontend/src/composables/useImportPolling.ts
import { ref, onScopeDispose } from 'vue'
import * as importTasksApi from '@/api/importTasks'
import type { ImportStatus } from '@/types/importTask'

export function useImportPolling(onComplete: (recipeId: string) => void) {
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
          onComplete(task.recipe_id)
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

- [ ] **Step 4: Run composable tests**

```bash
cd frontend && npx vitest run src/composables/useImportPolling.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useImportPolling.ts frontend/src/composables/useImportPolling.test.ts
git commit -m "feat: add useImportPolling composable"
```

---

## Task 14: RecipeListView — use composable + add image upload

**Files:**
- Modify: `frontend/src/views/RecipeListView.vue`
- Modify: `frontend/src/views/RecipeListView.test.ts`

- [ ] **Step 1: Add image upload tests to RecipeListView.test.ts**

In `frontend/src/views/RecipeListView.test.ts`, add these cases inside the existing `describe` block after the last test:

```typescript
  it('shows an image upload button', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="import-image-btn"]').exists()).toBe(true)
  })

  it('disables image button and shows spinner while importing image', async () => {
    vi.mocked(importTasksApi.importRecipeFromImage).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-img-1', status: 'pending' }),
    )

    const wrapper = mount(RecipeListView)
    // Simulate file selection on the hidden input
    const input = wrapper.find('[data-testid="import-image-input"]')
    const file = new File([new Uint8Array(32)], 'recipe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await wrapper.vm.$nextTick()

    expect((wrapper.find('[data-testid="import-image-btn"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-testid="import-spinner"]').exists()).toBe(true)
  })

  it('navigates to edit view when image task completes', async () => {
    vi.mocked(importTasksApi.importRecipeFromImage).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-img-2', status: 'pending' }),
    )
    vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
      axiosOk<ImportTask>({
        id: 'task-img-2',
        status: 'completed',
        recipe_id: 'recipe-img-99',
        error_message: null,
        import_type: 'image',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    )

    const wrapper = mount(RecipeListView)
    const input = wrapper.find('[data-testid="import-image-input"]')
    const file = new File([new Uint8Array(32)], 'recipe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await wrapper.vm.$nextTick()
    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.vm.$nextTick()

    expect(mockPush).toHaveBeenCalledWith('/recipes/recipe-img-99/edit')
  })
```

Also update the `ImportTask` import at the top of the test file (it already imports it, but the type now has `import_type`):

Find:
```typescript
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'
```

Replace with:
```typescript
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'
// ensure existing tests keep passing by adding import_type to inline task fixtures
```

Then update the existing inline `ImportTask` objects in `test_navigates_to_edit_view_when_task_completes` and `test_shows_error_message_and_re-enables_form_when_task_fails` to include `import_type: 'url'`:

In `test_navigates_to_edit_view_when_task_completes`, change the mocked task:
```typescript
      axiosOk<ImportTask>({
        id: 'task-1',
        status: 'completed',
        recipe_id: 'recipe-42',
        error_message: null,
        import_type: 'url',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
```

In `test_shows_error_message...`, change the mocked task:
```typescript
      axiosOk<ImportTask>({
        id: 'task-1',
        status: 'failed',
        recipe_id: null,
        error_message: 'Could not extract recipe from page',
        import_type: 'url',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
cd frontend && npx vitest run src/views/RecipeListView.test.ts
```

Expected: 3 new tests FAIL (`import-image-btn` not found), existing tests PASS.

- [ ] **Step 3: Rewrite RecipeListView.vue**

Replace the entire contents of `frontend/src/views/RecipeListView.vue`:

```vue
<!-- frontend/src/views/RecipeListView.vue -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import * as importTasksApi from '@/api/importTasks'
import RecipeCard from '@/components/RecipeCard.vue'
import TagFilter from '@/components/TagFilter.vue'
import { useImportPolling } from '@/composables/useImportPolling'

const recipeStore = useRecipeStore()
const router = useRouter()

const importUrl = ref('')
const selectedTags = ref<string[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)

const { status: importStatus, error: importError, startPolling } = useImportPolling(
  (recipeId: string) => router.push(`/recipes/${recipeId}/edit`),
)

const isImporting = computed(
  () => importStatus.value === 'pending' || importStatus.value === 'processing',
)

async function submitUrlImport() {
  if (!importUrl.value || isImporting.value) return
  importError.value = null
  importStatus.value = 'pending'
  try {
    const { data } = await importTasksApi.importRecipeFromUrl(importUrl.value)
    startPolling(data.task_id)
  } catch {
    importStatus.value = 'failed'
    importError.value = 'Failed to start import. Please try again.'
  }
}

async function handleImageChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || isImporting.value) return
  importError.value = null
  importStatus.value = 'pending'
  try {
    const { data } = await importTasksApi.importRecipeFromImage(file)
    startPolling(data.task_id)
  } catch {
    importStatus.value = 'failed'
    importError.value = 'Failed to start image import. Please try again.'
  }
}

onMounted(() => {
  recipeStore.fetchRecipes()
})
</script>

<template>
  <main class="recipe-list-page">
    <header class="recipe-list-page__header">
      <h1>Recipes</h1>
    </header>

    <section class="import-section">
      <div class="import-section__url-row">
        <input
          v-model="importUrl"
          data-testid="import-url-input"
          type="url"
          placeholder="Paste a recipe URL to import…"
          :disabled="isImporting"
          class="import-section__input"
          @keyup.enter="submitUrlImport"
        />
        <button
          data-testid="import-submit-btn"
          :disabled="!importUrl || isImporting"
          class="import-section__btn"
          @click="submitUrlImport"
        >
          <span v-if="isImporting">
            <span data-testid="import-spinner" aria-hidden="true">⏳</span>
            Importing…
          </span>
          <span v-else>Import</span>
        </button>
      </div>

      <div class="import-section__image-row">
        <!-- Hidden native file input -->
        <input
          ref="imageInputRef"
          data-testid="import-image-input"
          type="file"
          accept="image/*"
          capture="environment"
          class="import-section__image-input"
          :disabled="isImporting"
          @change="handleImageChange"
        />
        <button
          data-testid="import-image-btn"
          type="button"
          :disabled="isImporting"
          class="import-section__image-btn"
          @click="imageInputRef?.click()"
        >
          📷 Import from photo
        </button>
      </div>

      <p v-if="importError" data-testid="import-error" class="import-section__error">
        {{ importError }}
      </p>
    </section>

    <TagFilter v-model="selectedTags" class="recipe-list-page__filters" />

    <p v-if="recipeStore.loading && !recipeStore.recipes.length" class="recipe-list-page__loading">
      Loading recipes…
    </p>

    <p v-else-if="!recipeStore.recipes.length" class="recipe-list-page__empty">
      No recipes yet. Create your first one!
    </p>

    <div v-else class="recipe-grid">
      <RecipeCard
        v-for="recipe in recipeStore.recipes"
        :key="recipe.id"
        :recipe="recipe"
      />
    </div>

    <button
      v-if="recipeStore.hasMore && recipeStore.recipes.length"
      class="recipe-list-page__load-more"
      :disabled="recipeStore.loading"
      @click="recipeStore.loadMore()"
    >
      {{ recipeStore.loading ? 'Loading…' : 'Load more' }}
    </button>

    <RouterLink to="/recipes/new" class="fab" aria-label="Create recipe">+</RouterLink>
  </main>
</template>

<style scoped>
.recipe-list-page {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}
.recipe-list-page__header {
  margin-bottom: 1rem;
}
.recipe-list-page__header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}
.recipe-list-page__loading,
.recipe-list-page__empty {
  text-align: center;
  color: #6b7280;
  padding: 3rem 0;
}
.recipe-list-page__filters {
  margin-bottom: 1.5rem;
}
.import-section {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.import-section__url-row {
  display: flex;
  gap: 0.5rem;
}
.import-section__input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.import-section__input:disabled {
  background: #f9fafb;
  color: #9ca3af;
}
.import-section__btn {
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}
.import-section__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.import-section__image-row {
  display: flex;
  align-items: center;
}
.import-section__image-input {
  display: none;
}
.import-section__image-btn {
  padding: 0.5rem 1rem;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.import-section__image-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.import-section__error {
  color: #dc2626;
  font-size: 0.875rem;
}
.recipe-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
@media (min-width: 768px) {
  .recipe-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (min-width: 1024px) {
  .recipe-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.recipe-list-page__load-more {
  display: block;
  margin: 1.5rem auto 0;
  padding: 0.625rem 2rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}
.recipe-list-page__load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fab {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 3.5rem;
  height: 3.5rem;
  background: #2563eb;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}
</style>
```

- [ ] **Step 4: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS, including the 3 new image import tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/RecipeListView.vue frontend/src/views/RecipeListView.test.ts
git commit -m "feat: refactor RecipeListView to use useImportPolling, add image import UI"
```

---

## Final verification

- [ ] **Run full backend test suite**

```bash
cd backend && pytest --cov=app --cov-report=term-missing -q
```

Expected: all tests pass.

- [ ] **Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Run frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: no type errors.
