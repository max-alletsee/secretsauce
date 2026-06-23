# UI Shell Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Shopping Lists + Settings in a responsive nav, make timeline past days editable with grey coding, add food-preference fields to Settings (unifying all four preference fields to `list[str]`), and delete four dead meal-plan views.

**Architecture:** Frontend is Vue 3 + TS (Composition API, Pinia, `@vue/test-utils` for unit tests). Backend is FastAPI + SQLModel + Alembic. The four user food-preference fields are already JSONB columns; this plan unifies their Pydantic/TS shape to `list[str]` and surfaces them in the UI. The meal-suggestion prompt already injects all four — only its formatting changes.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vite, Vitest + `@vue/test-utils`; Python 3.12, FastAPI, SQLModel, Alembic, pytest.

## Global Constraints

- Frontend: Vue 3 Composition API only, `<script setup lang="ts">`, scoped styles. Use `defineProps<T>()` / `defineEmits<T>()`. Mobile-first; breakpoints 375 / 768 / 1024px. No CSS framework.
- Existing frontend unit tests use `@vue/test-utils` `mount` — follow that pattern, do not introduce Testing Library here.
- Backend: async SQLAlchemy; all schema changes via Alembic; AI provider is google-genai only.
- Run the relevant test suite after changes; tests must pass before committing.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: Unify backend preference fields to `list[str]`

Change `dietary_restrictions` and `allergies` from `dict[str, Any]` to `list[str]` across model, schema, and prompt builder, with an Alembic data migration. This makes all four preference fields identical in shape.

**Files:**
- Modify: `backend/app/models/user.py:24-31`
- Modify: `backend/app/schemas/user.py:12-13,31-32`
- Modify: `backend/app/services/ai_service.py:405-446,449-462`
- Create: `backend/alembic/versions/<generated>_prefs_dict_to_list.py`
- Modify: `backend/tests/test_user_model.py:21`
- Modify: `backend/tests/test_user_schemas.py:25-33`
- Modify: `backend/tests/unit/test_meal_planner_service.py:11-12,38-42`
- Modify: `backend/tests/unit/test_ai_suggestions.py:28-29`

**Interfaces:**
- Produces: `User.dietary_restrictions: list[str]`, `User.allergies: list[str]` (model + `UserRead`); `UserUpdate.dietary_restrictions: list[str] | None`, `UserUpdate.allergies: list[str] | None`.
- Produces: `_build_suggestions_prompt(..., dietary_restrictions: list[str], allergies: list[str], ...)` rendering `Dietary restrictions: <comma-joined>` and `Allergies: <comma-joined>`.

- [ ] **Step 1: Update the prompt-builder tests to the new list shape (failing test)**

In `backend/tests/unit/test_meal_planner_service.py`, change the defaults in `_base_kwargs` (lines 11-12) and the `test_prompt_includes_dietary_restrictions` body:

```python
    defaults = dict(
        meal_types=["dinner"],
        days_ahead=3,
        dietary_restrictions=[],
        allergies=[],
        favorite_cuisines=[],
        disliked_ingredients=[],
        meal_plan_system_prompt=None,
        recipe_collection=[],
        steer_prompt=None,
        carryover_titles=[],
    )
```

```python
def test_prompt_includes_dietary_restrictions():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(dietary_restrictions=["vegan", "low-sodium"])
    )
    assert "vegan" in prompt.lower()
    assert "low-sodium" in prompt.lower()


def test_prompt_includes_allergies():
    prompt = _build_suggestions_prompt(
        **_base_kwargs(allergies=["peanuts", "shellfish"])
    )
    assert "peanuts" in prompt
    assert "shellfish" in prompt
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && pytest tests/unit/test_meal_planner_service.py::test_prompt_includes_allergies -q`
Expected: FAIL — `assert "shellfish" in prompt`. With the current dict-rendering code, `allergies=["peanuts", "shellfish"]` renders as `Allergies: ['peanuts', 'shellfish']`, so the substring check happens to pass; the real failure is the type contract. To force a clear red here, the rendering change in Step 3 is what makes the comma-joined form (`Allergies: peanuts, shellfish`) deterministic. If this test is already green, that is acceptable — proceed to Step 3, which locks the formatting.

- [ ] **Step 3: Update `_build_suggestions_prompt` to join lists**

In `backend/app/services/ai_service.py`, change the signature and the two render lines. Replace the `dietary_restrictions: dict,` and `allergies: dict,` parameter annotations in both `_build_suggestions_prompt` (lines ~410-411) and `generate_meal_suggestions` (lines ~454-455) with `list[str]`. Then change the rendering inside `_build_suggestions_prompt`:

```python
    if dietary_restrictions:
        parts.append(f"Dietary restrictions: {', '.join(dietary_restrictions)}")
    if allergies:
        parts.append(f"Allergies: {', '.join(allergies)}")
```

(The `favorite_cuisines` / `disliked_ingredients` blocks already use `', '.join(...)` — leave them.)

- [ ] **Step 4: Update model and schema**

In `backend/app/models/user.py`, replace lines 24-31:

```python
    dietary_restrictions: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    allergies: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
```

The `Any` import on line 4 is still used by `auth_providers` (line 51), so leave it.

In `backend/app/schemas/user.py`, change lines 12-13 to `list[str]` and lines 31-32 to `list[str] | None = None`:

```python
    dietary_restrictions: list[str]
    allergies: list[str]
```

```python
    dietary_restrictions: list[str] | None = None
    allergies: list[str] | None = None
```

- [ ] **Step 5: Update the remaining backend tests**

In `backend/tests/test_user_model.py`, change line 21:

```python
    assert user.dietary_restrictions == []
```

In `backend/tests/test_user_schemas.py`, replace `test_user_update_with_preferences` (lines 25-33):

```python
def test_user_update_with_preferences():
    update = UserUpdate(
        dietary_restrictions=["vegan"],
        preferred_units="imperial",
        favorite_cuisines=["italian", "japanese"],
    )
    assert update.dietary_restrictions == ["vegan"]
    assert update.preferred_units == "imperial"
    assert update.favorite_cuisines == ["italian", "japanese"]
```

In `backend/tests/unit/test_ai_suggestions.py`, change lines 28-29 in the `generate_meal_suggestions` call:

```python
            dietary_restrictions=[],
            allergies=[],
```

- [ ] **Step 6: Run all affected unit tests**

Run: `cd backend && pytest tests/unit/test_meal_planner_service.py tests/unit/test_ai_suggestions.py tests/test_user_model.py tests/test_user_schemas.py -q`
Expected: PASS (all).

- [ ] **Step 7: Generate the Alembic migration manually**

Create `backend/alembic/versions/b1a2c3d4e5f6_prefs_dict_to_list.py` (pick any unused 12-char hex revision id; set `down_revision` to the current head — find it with `cd backend && alembic heads`). The migration converts existing JSONB dict values to arrays and changes the server default.

```python
"""convert dietary_restrictions and allergies from dict to list

Revision ID: b1a2c3d4e5f6
Revises: <CURRENT_HEAD>
Create Date: 2026-06-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b1a2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "<CURRENT_HEAD>"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert object values to arrays of their keys; {} -> []
    op.execute(
        """
        UPDATE users
        SET dietary_restrictions = (
            SELECT COALESCE(jsonb_agg(key), '[]'::jsonb)
            FROM jsonb_object_keys(dietary_restrictions) AS key
        )
        WHERE jsonb_typeof(dietary_restrictions) = 'object'
        """
    )
    op.execute(
        """
        UPDATE users
        SET allergies = (
            SELECT COALESCE(jsonb_agg(key), '[]'::jsonb)
            FROM jsonb_object_keys(allergies) AS key
        )
        WHERE jsonb_typeof(allergies) = 'object'
        """
    )
    op.alter_column(
        "users", "dietary_restrictions",
        server_default=sa.text("'[]'::jsonb"),
    )
    op.alter_column(
        "users", "allergies",
        server_default=sa.text("'[]'::jsonb"),
    )


def downgrade() -> None:
    # Convert arrays back into key->true maps; [] -> {}
    op.execute(
        """
        UPDATE users
        SET dietary_restrictions = (
            SELECT COALESCE(jsonb_object_agg(elem, 'true'::jsonb), '{}'::jsonb)
            FROM jsonb_array_elements_text(dietary_restrictions) AS elem
        )
        WHERE jsonb_typeof(dietary_restrictions) = 'array'
        """
    )
    op.execute(
        """
        UPDATE users
        SET allergies = (
            SELECT COALESCE(jsonb_object_agg(elem, 'true'::jsonb), '{}'::jsonb)
            FROM jsonb_array_elements_text(allergies) AS elem
        )
        WHERE jsonb_typeof(allergies) = 'array'
        """
    )
    op.alter_column(
        "users", "dietary_restrictions",
        server_default=sa.text("'{}'::jsonb"),
    )
    op.alter_column(
        "users", "allergies",
        server_default=sa.text("'{}'::jsonb"),
    )
```

- [ ] **Step 8: Apply and verify the migration round-trips**

Run: `cd backend && alembic upgrade head && alembic downgrade -1 && alembic upgrade head`
Expected: all three commands succeed with no error.

- [ ] **Step 9: Run the full backend suite**

Run: `cd backend && pytest -q`
Expected: PASS (no regressions).

- [ ] **Step 10: Commit**

```bash
git add backend/app/models/user.py backend/app/schemas/user.py backend/app/services/ai_service.py backend/alembic/versions/ backend/tests/
git commit -m "$(printf 'refactor: unify user preference fields to list[str]\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Update frontend user types to `string[]`

Mirror the backend change in TypeScript so the Settings form can treat all four fields identically.

**Files:**
- Modify: `frontend/src/types/user.ts:11-12,42-43`

**Interfaces:**
- Produces: `User.dietary_restrictions: string[]`, `User.allergies: string[]`; `UserUpdatePayload.dietary_restrictions?: string[]`, `UserUpdatePayload.allergies?: string[]`.

- [ ] **Step 1: Change the four type lines**

In `frontend/src/types/user.ts`, change lines 11-12:

```typescript
  dietary_restrictions: string[]
  allergies: string[]
```

and lines 42-43:

```typescript
  dietary_restrictions?: string[]
  allergies?: string[]
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run type-check`
Expected: PASS (no usages currently rely on the old `Record` shape — `ProfileSettingsView` does not read these fields yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/user.ts
git commit -m "$(printf 'refactor: user preference types to string arrays\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Add food-preference fields to Settings

Add a "Food preferences" section with four comma-separated inputs to `ProfileSettingsView.vue`, with one converter pair for all four `string[]` fields.

**Files:**
- Modify: `frontend/src/views/ProfileSettingsView.vue` (script lines 1-58; template lines 84-126; styles as needed)
- Create: `frontend/src/views/ProfileSettingsView.test.ts`

**Interfaces:**
- Consumes: `User.dietary_restrictions/allergies/favorite_cuisines/disliked_ingredients: string[]` (Task 2); `userStore.updateProfile(payload: UserUpdatePayload)`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/views/ProfileSettingsView.test.ts`:

```typescript
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const updateProfile = vi.fn().mockResolvedValue(undefined)
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: () => ({
    user: {
      display_name: 'Sam',
      preferred_units: 'metric',
      default_servings: 2,
      meal_plan_system_prompt: '',
      meal_plan_meal_types: ['dinner'],
      meal_plan_days_ahead: 7,
      dietary_restrictions: ['vegan'],
      allergies: ['peanuts'],
      favorite_cuisines: ['italian'],
      disliked_ingredients: ['cilantro'],
    },
    updateProfile,
  }),
}))

import ProfileSettingsView from './ProfileSettingsView.vue'

describe('ProfileSettingsView food preferences', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    updateProfile.mockClear()
  })

  it('prefills the four preference fields as comma-separated strings', () => {
    const wrapper = mount(ProfileSettingsView)
    const dietary = wrapper.get('[data-testid="pref-dietary_restrictions"]')
      .element as HTMLInputElement
    expect(dietary.value).toBe('vegan')
    const allergies = wrapper.get('[data-testid="pref-allergies"]')
      .element as HTMLInputElement
    expect(allergies.value).toBe('peanuts')
  })

  it('serializes edited fields to trimmed string arrays on save', async () => {
    const wrapper = mount(ProfileSettingsView)
    await wrapper.get('[data-testid="pref-allergies"]')
      .setValue('peanuts, shellfish ,  ')
    await wrapper.get('[data-testid="pref-favorite_cuisines"]')
      .setValue('italian, thai')
    await wrapper.get('[data-testid="save-btn"]').trigger('click')
    await flushPromises()
    expect(updateProfile).toHaveBeenCalledTimes(1)
    const payload = updateProfile.mock.calls[0][0]
    expect(payload.allergies).toEqual(['peanuts', 'shellfish'])
    expect(payload.favorite_cuisines).toEqual(['italian', 'thai'])
    expect(payload.dietary_restrictions).toEqual(['vegan'])
    expect(payload.disliked_ingredients).toEqual(['cilantro'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/views/ProfileSettingsView.test.ts`
Expected: FAIL — `[data-testid="pref-allergies"]` not found / `save-btn` missing testid.

- [ ] **Step 3: Add the converter + state + load/save logic**

In `frontend/src/views/ProfileSettingsView.vue`, add to the `<script setup>` block. After the existing refs (after line 12), add four refs:

```typescript
const dietaryRestrictions = ref('')
const allergies = ref('')
const favoriteCuisines = ref('')
const dislikedIngredients = ref('')

function toList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter((x) => x.length > 0)
}
function toInput(list: string[] | undefined): string {
  return (list ?? []).join(', ')
}
```

In `onMounted` (after line 36, inside the `if (!u) return` guard block), add:

```typescript
  dietaryRestrictions.value = toInput(u.dietary_restrictions)
  allergies.value = toInput(u.allergies)
  favoriteCuisines.value = toInput(u.favorite_cuisines)
  dislikedIngredients.value = toInput(u.disliked_ingredients)
```

In `save()`'s `updateProfile` call (lines 44-51), add the four fields to the payload object:

```typescript
    await userStore.updateProfile({
      display_name: displayName.value || null,
      preferred_units: preferredUnits.value,
      default_servings: defaultServings.value,
      meal_plan_system_prompt: mealPlanSystemPrompt.value || null,
      meal_plan_meal_types: mealPlanMealTypes.value,
      meal_plan_days_ahead: mealPlanDaysAhead.value,
      dietary_restrictions: toList(dietaryRestrictions.value),
      allergies: toList(allergies.value),
      favorite_cuisines: toList(favoriteCuisines.value),
      disliked_ingredients: toList(dislikedIngredients.value),
    })
```

- [ ] **Step 4: Add the template section + save-btn testid**

In `frontend/src/views/ProfileSettingsView.vue`, add a new `<section>` after the "Meal Planning" section (after line 126, before the `<div class="actions">`):

```html
    <section class="settings-section">
      <h2>Food preferences</h2>
      <p class="section-hint">Comma-separated. These guide AI meal suggestions.</p>

      <label class="field-label">
        Dietary restrictions
        <input
          v-model="dietaryRestrictions"
          type="text"
          class="field-input"
          data-testid="pref-dietary_restrictions"
          placeholder="e.g. vegetarian, low-sodium"
        />
      </label>
      <label class="field-label">
        Allergies
        <input
          v-model="allergies"
          type="text"
          class="field-input"
          data-testid="pref-allergies"
          placeholder="e.g. peanuts, shellfish"
        />
      </label>
      <label class="field-label">
        Favorite cuisines
        <input
          v-model="favoriteCuisines"
          type="text"
          class="field-input"
          data-testid="pref-favorite_cuisines"
          placeholder="e.g. italian, thai"
        />
      </label>
      <label class="field-label">
        Disliked ingredients
        <input
          v-model="dislikedIngredients"
          type="text"
          class="field-input"
          data-testid="pref-disliked_ingredients"
          placeholder="e.g. cilantro, olives"
        />
      </label>
    </section>
```

Add `data-testid="save-btn"` to the save button (line 131):

```html
      <button :disabled="saving" class="save-btn" data-testid="save-btn" @click="save">
```

Add a style rule for `.section-hint` inside `<style scoped>`:

```css
.section-hint { font-size: 0.8125rem; color: #6b7280; margin: -0.5rem 0 1rem; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/views/ProfileSettingsView.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Type-check and commit**

Run: `cd frontend && npm run type-check`
Expected: PASS.

```bash
git add frontend/src/views/ProfileSettingsView.vue frontend/src/views/ProfileSettingsView.test.ts
git commit -m "$(printf 'feat: add food preference fields to settings\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Make timeline past days editable with grey coding

Stop disabling past slots and soften the grey treatment so past days are a legible, editable log.

**Files:**
- Modify: `frontend/src/components/MealPlanGrid.vue:67-80,115-118`
- Modify: `frontend/src/views/TimelineView.vue:324-328` (remove redundant inline Settings link)
- Create: `frontend/src/components/MealPlanGrid.test.ts`

**Interfaces:**
- Consumes: `MealSlot` `disabled?: boolean` prop (unchanged).
- Produces: `MealPlanGrid` renders past-day slots with add/menu controls enabled (no `disabled` forced).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/MealPlanGrid.test.ts`:

```typescript
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/timeline', () => ({
  listEntries: vi.fn().mockResolvedValue({ data: { entries: [] } }),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn().mockResolvedValue({ data: null }),
}))
vi.mock('@/api/mealPlans', () => ({
  getShortlist: vi.fn().mockResolvedValue({ data: [] }),
  addToShortlist: vi.fn(),
  removeFromShortlist: vi.fn().mockResolvedValue({ data: null }),
  reorderShortlist: vi.fn(),
}))
vi.mock('@/api/recipes', () => ({
  getRecipes: vi.fn().mockResolvedValue({ data: { items: [], next_cursor: null, has_more: false } }),
}))

import MealPlanGrid from './MealPlanGrid.vue'

describe('MealPlanGrid past days', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders past-day slots as editable (add control present) but grey', () => {
    const wrapper = mount(MealPlanGrid, {
      props: {
        fromDate: '2026-06-21',
        toDate: '2026-06-21',
        mealTypes: ['dinner'],
        entries: [],
        recipeTitles: {},
        todayStr: '2026-06-23',
      },
    })
    // Past row is visually marked
    expect(wrapper.find('.day-row--past').exists()).toBe(true)
    // ...but its add control is still rendered (editable)
    expect(
      wrapper.find('[data-testid="slot-add-2026-06-21-dinner"]').exists(),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/MealPlanGrid.test.ts`
Expected: FAIL — `slot-add-2026-06-21-dinner` not found, because `MealSlot` receives `:disabled="isPast(day)"` (true) and hides the add control.

- [ ] **Step 3: Stop forcing `disabled` on past slots**

In `frontend/src/components/MealPlanGrid.vue`, change the `MealSlot` `:disabled` binding (line 74) from:

```html
        :disabled="isPast(day)"
```

to:

```html
        :disabled="false"
```

- [ ] **Step 4: Soften past-day styling so it stays legible and interactive**

In `frontend/src/components/MealPlanGrid.vue`, replace the `.day-row--past` rule (lines 115-118):

```css
.day-row--past .day-label,
.day-row--past .meal-slot {
  filter: grayscale(1);
}
.day-row--past .meal-slot {
  background: #eceef1;
}
```

(Removes `opacity: 0.4` and `pointer-events: none`; entries remain readable and clickable, with a grey tint marking them as past.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/MealPlanGrid.test.ts`
Expected: PASS.

- [ ] **Step 6: Remove the redundant inline Settings link from TimelineView**

In `frontend/src/views/TimelineView.vue`, replace the grid header (lines 325-328):

```html
      <div class="grid-header">
        <span class="grid-title">Meal Plan</span>
      </div>
```

Then remove the now-unused `.settings-link` style rules (lines 408-413) and run type-check to confirm no dangling references.

- [ ] **Step 7: Run timeline-related tests + type-check**

Run: `cd frontend && npx vitest run src/components/MealSlot.test.ts src/components/MealPlanGrid.test.ts && npm run type-check`
Expected: PASS (existing `MealSlot` `disabled` test still passes — that prop path is unchanged).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/MealPlanGrid.vue frontend/src/components/MealPlanGrid.test.ts frontend/src/views/TimelineView.vue
git commit -m "$(printf 'feat: make timeline past days editable with grey coding\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Responsive navigation (top bar + mobile bottom tab bar)

Add Shopping Lists and Settings to the nav; render a bottom tab bar on mobile.

**Files:**
- Modify: `frontend/src/App.vue` (entire file)
- Create: `frontend/src/App.test.ts`

**Interfaces:**
- Consumes: `userStore.isAuthenticated`, `userStore.isSuperuser`, `userStore.logout()`; routes `/recipes`, `/meal-plan`, `/shopping-lists`, `/settings`, `/admin` (all already in router).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/App.test.ts`:

```typescript
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const logout = vi.fn().mockResolvedValue(undefined)
let authed = true
let superuser = false
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: () => ({
    get isAuthenticated() { return authed },
    get isSuperuser() { return superuser },
    logout,
  }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
  RouterView: { template: '<div />' },
}))

import App from './App.vue'

describe('App nav', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    authed = true
    superuser = false
    logout.mockClear()
  })

  it('shows primary destinations including Shopping Lists and Settings', () => {
    const wrapper = mount(App)
    const text = wrapper.text()
    expect(text).toContain('Recipes')
    expect(text).toContain('Meal Plan')
    expect(text).toContain('Shopping Lists')
    expect(text).toContain('Settings')
  })

  it('renders a mobile bottom tab bar', () => {
    const wrapper = mount(App)
    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(true)
  })

  it('hides nav when unauthenticated', () => {
    authed = false
    const wrapper = mount(App)
    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(false)
    expect(wrapper.find('.app-nav').exists()).toBe(false)
  })

  it('shows Admin link only for superusers', () => {
    superuser = true
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Admin')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.ts`
Expected: FAIL — `Shopping Lists`/`Settings` text and `[data-testid="bottom-nav"]` absent.

- [ ] **Step 3: Rewrite App.vue**

Replace the entire contents of `frontend/src/App.vue`:

```vue
<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import ToastHost from '@/components/ToastHost.vue'

const userStore = useUserStore()
const router = useRouter()

const primaryLinks = [
  { to: '/recipes', label: 'Recipes', icon: '🍳' },
  { to: '/meal-plan', label: 'Meal Plan', icon: '📅' },
  { to: '/shopping-lists', label: 'Shopping Lists', icon: '🛒' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

async function handleLogout() {
  await userStore.logout()
  router.push('/login')
}
</script>

<template>
  <template v-if="userStore.isAuthenticated">
    <!-- Top bar (primary links on desktop; secondary actions always) -->
    <nav class="app-nav">
      <div class="app-nav__links">
        <RouterLink v-for="link in primaryLinks" :key="link.to" :to="link.to">
          {{ link.label }}
        </RouterLink>
      </div>
      <div class="app-nav__secondary">
        <RouterLink v-if="userStore.isSuperuser" to="/admin">Admin</RouterLink>
        <button data-testid="logout" class="app-nav__logout" @click="handleLogout">
          Log out
        </button>
      </div>
    </nav>

    <main class="app-main">
      <RouterView />
    </main>

    <!-- Bottom tab bar (mobile only via CSS) -->
    <nav class="bottom-nav" data-testid="bottom-nav">
      <RouterLink
        v-for="link in primaryLinks"
        :key="link.to"
        :to="link.to"
        class="bottom-nav__item"
      >
        <span class="bottom-nav__icon">{{ link.icon }}</span>
        <span class="bottom-nav__label">{{ link.label }}</span>
      </RouterLink>
    </nav>
  </template>
  <template v-else>
    <RouterView />
  </template>
  <ToastHost />
</template>

<style scoped>
.app-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #1e293b;
  color: white;
}
.app-nav__links {
  display: flex;
  gap: 1.5rem;
}
.app-nav__secondary {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.app-nav__links a,
.app-nav__secondary a {
  color: #cbd5e1;
  text-decoration: none;
  font-size: 0.9375rem;
}
.app-nav__links a.router-link-active,
.app-nav__secondary a.router-link-active {
  color: white;
  font-weight: 600;
}
.app-nav__logout {
  background: none;
  border: 1px solid #475569;
  color: #cbd5e1;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.app-nav__logout:hover {
  border-color: #94a3b8;
  color: white;
}
.app-main {
  min-height: 0;
}

/* Bottom tab bar */
.bottom-nav {
  display: none;
}
.bottom-nav__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0;
  color: #64748b;
  text-decoration: none;
  font-size: 0.6875rem;
}
.bottom-nav__item.router-link-active {
  color: #2563eb;
}
.bottom-nav__icon {
  font-size: 1.1rem;
  line-height: 1;
}

/* Mobile: hide top primary links, show bottom tab bar */
@media (max-width: 767px) {
  .app-nav__links {
    display: none;
  }
  .app-main {
    padding-bottom: 4rem;
  }
  .bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: white;
    border-top: 1px solid #e5e7eb;
    z-index: 50;
  }
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Type-check and commit**

Run: `cd frontend && npm run type-check`
Expected: PASS.

```bash
git add frontend/src/App.vue frontend/src/App.test.ts
git commit -m "$(printf 'feat: responsive nav with shopping lists and settings\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Delete dead meal-plan views and orphaned components

Remove the four unrouted views and the two components used only by them.

**Files:**
- Delete: `frontend/src/views/MealPlanCreateView.vue`
- Delete: `frontend/src/views/MealPlanDetailView.vue`
- Delete: `frontend/src/views/MealPlanListView.vue`
- Delete: `frontend/src/views/MealPlanLogView.vue`
- Delete: `frontend/src/components/MealPlanCard.vue`
- Delete: `frontend/src/components/CarryoverBanner.vue`
- Modify: `frontend/CLAUDE.md` (route list lines under "## Routing")

**Interfaces:**
- Consumes: nothing. These modules have no live consumers (verified: router uses `TimelineView` for `/meal-plan`; `MealPlanCard`/`CarryoverBanner` are imported only by the deleted views). `useMealPlanStore` and `api/mealPlans.ts` are retained — `TimelineView` and store tests use them.

- [ ] **Step 1: Re-verify no live references before deleting**

Run: `cd frontend && rg -l "MealPlanCreateView|MealPlanDetailView|MealPlanListView|MealPlanLogView|MealPlanCard|CarryoverBanner" src`
Expected: only the six files about to be deleted appear (no router, no other component/view). If anything else appears, STOP and reassess.

- [ ] **Step 2: Delete the six files**

```bash
git rm frontend/src/views/MealPlanCreateView.vue \
       frontend/src/views/MealPlanDetailView.vue \
       frontend/src/views/MealPlanListView.vue \
       frontend/src/views/MealPlanLogView.vue \
       frontend/src/components/MealPlanCard.vue \
       frontend/src/components/CarryoverBanner.vue
```

(If a `MealPlanCard.test.ts` or `CarryoverBanner.test.ts` exists, `git rm` those too — check with `rg --files frontend/src | rg -i "MealPlanCard|CarryoverBanner"`.)

- [ ] **Step 3: Update the route list in frontend/CLAUDE.md**

In `frontend/CLAUDE.md`, under "## Routing", replace the three stale meal-plan/shopping lines:

```
- `/meal-plan` — TimelineView (auth required)
- `/shopping-lists` — ShoppingListsView (auth required)
- `/shopping-lists/:id` — ShoppingListView (auth required)
- `/settings` — ProfileSettingsView (auth required)
```

(Replace the former `/meal-plans`, `/meal-plans/:id`, `/meal-plans/new`, and `/shopping-lists/:mealPlanId` lines.)

- [ ] **Step 4: Type-check and run the full frontend unit suite**

Run: `cd frontend && npm run type-check && npm run test:unit`
Expected: PASS — no import resolves to a deleted file.

- [ ] **Step 5: Commit**

```bash
git add -A frontend
git commit -m "$(printf 'chore: remove dead meal-plan views and orphaned components\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: Final full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Frontend — lint, type-check, unit tests**

Run: `cd frontend && npm run lint && npm run type-check && npm run test:unit`
Expected: all PASS.

- [ ] **Step 2: Backend — full suite**

Run: `cd backend && pytest -q && ruff check app/ && mypy app/`
Expected: all PASS.

- [ ] **Step 3: Confirm migration is at head**

Run: `cd backend && alembic upgrade head`
Expected: "Running upgrade ... " or already at head, no error.
