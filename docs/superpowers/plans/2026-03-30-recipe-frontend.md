# Recipe CRUD Frontend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend UI for recipe CRUD with versioning — types, API client, Pinia store, 4 views, 6 components, and router wiring — so users can create, browse, edit, and delete recipes with version history.

**Architecture:** Types mirror the backend `RecipeResponse` shape (nested `current_version` object). A Pinia composition store (`useRecipeStore`) owns all recipe state and calls typed API functions. Views are thin page-level wrappers that connect the store to components. Components are props-in/events-out — no direct API calls. Mobile-first CSS with 375px/768px/1024px breakpoints. PrimeVue is installed but unused (unstyled mode) — all UI is plain HTML + scoped CSS, consistent with existing auth views.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Pinia, Vue Router, axios, Vitest + @vue/test-utils.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/types/recipe.ts` | TypeScript interfaces matching backend response shapes |
| Create | `frontend/src/api/recipes.ts` | Typed API functions for all 7 recipe endpoints |
| Create | `frontend/src/stores/useRecipeStore.ts` | Pinia store: recipe list, current recipe, versions, pagination, CRUD actions |
| Create | `frontend/src/stores/useRecipeStore.test.ts` | Vitest tests for all store actions |
| Modify | `frontend/src/router/index.ts` | Add recipe routes: `/recipes`, `/recipes/new`, `/recipes/:id`, `/recipes/:id/edit` |
| Create | `frontend/src/components/RecipeCard.vue` | Card for recipe list grid |
| Create | `frontend/src/components/TagSelector.vue` | Grouped toggle chips for pre-built tags |
| Create | `frontend/src/components/IngredientDrawer.vue` | Bottom drawer for ingredient editing |
| Create | `frontend/src/components/StepDrawer.vue` | Bottom drawer for step editing |
| Create | `frontend/src/components/RecipeForm.vue` | Full recipe create/edit form with validation |
| Create | `frontend/src/components/VersionHistoryPanel.vue` | Collapsible version list with restore |
| Create | `frontend/src/views/RecipeListView.vue` | Recipe grid with pagination |
| Create | `frontend/src/views/RecipeDetailView.vue` | Full recipe display with version history |
| Create | `frontend/src/views/RecipeCreateView.vue` | Wraps RecipeForm for creation |
| Create | `frontend/src/views/RecipeEditView.vue` | Wraps RecipeForm for editing |

---

## Chunk 1: Types + API Client

### Task 1: Recipe TypeScript types

**Files:**
- Create: `frontend/src/types/recipe.ts`

The backend `RecipeResponse` has a nested `current_version: RecipeVersionResponse` object. The frontend types must match this shape exactly — do NOT flatten version fields into `Recipe`.

- [ ] **Step 1: Write `frontend/src/types/recipe.ts`**

```typescript
// frontend/src/types/recipe.ts

export interface Ingredient {
  name: string
  quantity: string
  unit: string | null
}

export interface Step {
  order: number
  instruction: string
}

export interface RecipeSource {
  type: 'url' | 'book'
  url?: string
  book_title?: string
  page?: number
}

export interface RecipeVersion {
  id: string
  recipe_id: string
  version_number: number
  title: string
  description: string | null
  ingredients: Ingredient[]
  steps: Step[]
  servings: number
  prep_time_minutes: number | null
  waiting_time_minutes: number | null
  cook_time_minutes: number | null
  total_time_minutes: number | null
  tags: string[]
  recipe_source: RecipeSource | null
  created_at: string
  created_by: string
}

export interface Recipe {
  id: string
  owner_id: string
  visibility: 'private' | 'shared'
  current_version: RecipeVersion
  created_at: string
  updated_at: string
}

export interface RecipeCreatePayload {
  title: string
  description?: string | null
  ingredients: Ingredient[]
  steps: Step[]
  servings?: number
  prep_time_minutes?: number | null
  waiting_time_minutes?: number | null
  cook_time_minutes?: number | null
  tags?: string[]
  recipe_source?: RecipeSource | null
  visibility?: 'private' | 'shared'
}

export interface RecipeUpdatePayload {
  title?: string
  description?: string | null
  ingredients?: Ingredient[]
  steps?: Step[]
  servings?: number
  prep_time_minutes?: number | null
  waiting_time_minutes?: number | null
  cook_time_minutes?: number | null
  tags?: string[]
  recipe_source?: RecipeSource | null
  visibility?: 'private' | 'shared'
}

export interface PaginatedResponse<T> {
  items: T[]
  next_cursor: string | null
  has_more: boolean
}
```

- [ ] **Step 2: Run type-check to confirm types compile**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: no errors related to `recipe.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/recipe.ts
git commit -m "feat(frontend): add Recipe TypeScript types matching backend response shape"
```

---

### Task 2: Recipe API client

**Files:**
- Create: `frontend/src/api/recipes.ts`

Follow the exact pattern from `frontend/src/api/auth.ts` — import the shared axios client, export typed functions.

- [ ] **Step 1: Write `frontend/src/api/recipes.ts`**

```typescript
// frontend/src/api/recipes.ts
import client from './client'
import type {
  Recipe,
  RecipeCreatePayload,
  RecipeUpdatePayload,
  RecipeVersion,
  PaginatedResponse,
} from '@/types/recipe'

export const getRecipes = (cursor?: string) =>
  client.get<PaginatedResponse<Recipe>>('/recipes', { params: { cursor } })

export const getRecipe = (id: string) =>
  client.get<Recipe>(`/recipes/${id}`)

export const createRecipe = (data: RecipeCreatePayload) =>
  client.post<Recipe>('/recipes', data)

export const updateRecipe = (id: string, data: RecipeUpdatePayload) =>
  client.patch<Recipe>(`/recipes/${id}`, data)

export const deleteRecipe = (id: string) =>
  client.delete(`/recipes/${id}`)

export const getVersions = (id: string) =>
  client.get<RecipeVersion[]>(`/recipes/${id}/versions`)

export const restoreVersion = (id: string, versionId: string) =>
  client.post<Recipe>(`/recipes/${id}/versions/${versionId}/restore`)
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/recipes.ts
git commit -m "feat(frontend): add typed recipe API client functions"
```

---

## Chunk 2: Pinia Store + Tests

### Task 3: Recipe store tests

**Files:**
- Create: `frontend/src/stores/useRecipeStore.test.ts`

Follow the exact pattern from `frontend/src/stores/useUserStore.test.ts`: `vi.mock` the API module, create pinia in `beforeEach`, test each action.

- [ ] **Step 1: Write the store tests**

```typescript
// frontend/src/stores/useRecipeStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/recipes', () => ({
  getRecipes: vi.fn(),
  getRecipe: vi.fn(),
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  deleteRecipe: vi.fn(),
  getVersions: vi.fn(),
  restoreVersion: vi.fn(),
}))

import * as recipesApi from '@/api/recipes'
import { useRecipeStore } from './useRecipeStore'

const mockVersion = {
  id: 'v1',
  recipe_id: 'r1',
  version_number: 1,
  title: 'Pasta Carbonara',
  description: 'Classic Roman pasta',
  ingredients: [{ name: 'spaghetti', quantity: '400', unit: 'g' }],
  steps: [{ order: 1, instruction: 'Boil pasta' }],
  servings: 2,
  prep_time_minutes: 10,
  waiting_time_minutes: null,
  cook_time_minutes: 20,
  total_time_minutes: 30,
  tags: ['italian', 'dinner'],
  recipe_source: null,
  created_at: '2026-01-01T00:00:00Z',
  created_by: 'u1',
}

const mockRecipe = {
  id: 'r1',
  owner_id: 'u1',
  visibility: 'private' as const,
  current_version: mockVersion,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('useRecipeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts with empty state', () => {
    const store = useRecipeStore()
    expect(store.recipes).toEqual([])
    expect(store.currentRecipe).toBeNull()
    expect(store.versions).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.nextCursor).toBeNull()
    expect(store.hasMore).toBe(true)
  })

  it('fetchRecipes populates recipes and pagination state', async () => {
    vi.mocked(recipesApi.getRecipes).mockResolvedValueOnce({
      data: { items: [mockRecipe], next_cursor: 'abc', has_more: true },
    } as any)

    const store = useRecipeStore()
    await store.fetchRecipes()

    expect(store.recipes).toEqual([mockRecipe])
    expect(store.nextCursor).toBe('abc')
    expect(store.hasMore).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('fetchRecipes resets state on fresh load', async () => {
    vi.mocked(recipesApi.getRecipes).mockResolvedValueOnce({
      data: { items: [mockRecipe], next_cursor: null, has_more: false },
    } as any)

    const store = useRecipeStore()
    store.recipes = [mockRecipe, mockRecipe] // simulate pre-existing data
    store.nextCursor = 'old'

    await store.fetchRecipes()

    expect(store.recipes).toEqual([mockRecipe])
    expect(store.nextCursor).toBeNull()
    expect(store.hasMore).toBe(false)
  })

  it('loadMore appends to existing recipes', async () => {
    const secondRecipe = { ...mockRecipe, id: 'r2' }
    vi.mocked(recipesApi.getRecipes).mockResolvedValueOnce({
      data: { items: [secondRecipe], next_cursor: null, has_more: false },
    } as any)

    const store = useRecipeStore()
    store.recipes = [mockRecipe]
    store.nextCursor = 'abc'
    store.hasMore = true

    await store.loadMore()

    expect(store.recipes).toEqual([mockRecipe, secondRecipe])
    expect(store.hasMore).toBe(false)
    expect(recipesApi.getRecipes).toHaveBeenCalledWith('abc')
  })

  it('loadMore does nothing when hasMore is false', async () => {
    const store = useRecipeStore()
    store.hasMore = false

    await store.loadMore()

    expect(recipesApi.getRecipes).not.toHaveBeenCalled()
  })

  it('fetchRecipe loads a single recipe into currentRecipe', async () => {
    vi.mocked(recipesApi.getRecipe).mockResolvedValueOnce({
      data: mockRecipe,
    } as any)

    const store = useRecipeStore()
    await store.fetchRecipe('r1')

    expect(store.currentRecipe).toEqual(mockRecipe)
    expect(recipesApi.getRecipe).toHaveBeenCalledWith('r1')
  })

  it('createRecipe calls API and returns the created recipe', async () => {
    vi.mocked(recipesApi.createRecipe).mockResolvedValueOnce({
      data: mockRecipe,
    } as any)

    const store = useRecipeStore()
    const payload = {
      title: 'Pasta Carbonara',
      ingredients: [{ name: 'spaghetti', quantity: '400', unit: 'g' }],
      steps: [{ order: 1, instruction: 'Boil pasta' }],
    }
    const result = await store.createRecipe(payload)

    expect(result).toEqual(mockRecipe)
    expect(recipesApi.createRecipe).toHaveBeenCalledWith(payload)
  })

  it('updateRecipe calls API and refreshes currentRecipe', async () => {
    const updated = {
      ...mockRecipe,
      current_version: { ...mockVersion, title: 'Updated Title', version_number: 2 },
    }
    vi.mocked(recipesApi.updateRecipe).mockResolvedValueOnce({
      data: updated,
    } as any)

    const store = useRecipeStore()
    store.currentRecipe = mockRecipe
    await store.updateRecipe('r1', { title: 'Updated Title' })

    expect(store.currentRecipe).toEqual(updated)
    expect(recipesApi.updateRecipe).toHaveBeenCalledWith('r1', { title: 'Updated Title' })
  })

  it('deleteRecipe calls API and removes recipe from local list', async () => {
    vi.mocked(recipesApi.deleteRecipe).mockResolvedValueOnce({} as any)

    const store = useRecipeStore()
    store.recipes = [mockRecipe, { ...mockRecipe, id: 'r2' }]

    await store.deleteRecipe('r1')

    expect(store.recipes).toHaveLength(1)
    expect(store.recipes[0].id).toBe('r2')
    expect(recipesApi.deleteRecipe).toHaveBeenCalledWith('r1')
  })

  it('fetchVersions populates versions list', async () => {
    const v2 = { ...mockVersion, id: 'v2', version_number: 2, title: 'Updated' }
    vi.mocked(recipesApi.getVersions).mockResolvedValueOnce({
      data: [v2, mockVersion],
    } as any)

    const store = useRecipeStore()
    await store.fetchVersions('r1')

    expect(store.versions).toEqual([v2, mockVersion])
    expect(recipesApi.getVersions).toHaveBeenCalledWith('r1')
  })

  it('restoreVersion calls API and refreshes currentRecipe and versions', async () => {
    const restored = {
      ...mockRecipe,
      current_version: { ...mockVersion, id: 'v3', version_number: 3 },
    }
    vi.mocked(recipesApi.restoreVersion).mockResolvedValueOnce({
      data: restored,
    } as any)
    vi.mocked(recipesApi.getVersions).mockResolvedValueOnce({
      data: [restored.current_version, mockVersion],
    } as any)

    const store = useRecipeStore()
    store.currentRecipe = mockRecipe
    await store.restoreVersion('r1', 'v1')

    expect(store.currentRecipe).toEqual(restored)
    expect(recipesApi.restoreVersion).toHaveBeenCalledWith('r1', 'v1')
    expect(recipesApi.getVersions).toHaveBeenCalledWith('r1')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/stores/useRecipeStore.test.ts
```

Expected: FAIL — `useRecipeStore` does not exist yet.

---

### Task 4: Recipe store implementation

**Files:**
- Create: `frontend/src/stores/useRecipeStore.ts`

Follow the exact pattern from `frontend/src/stores/useUserStore.ts`: `defineStore` with composition API, `ref` for state, async functions for actions.

- [ ] **Step 1: Write `frontend/src/stores/useRecipeStore.ts`**

```typescript
// frontend/src/stores/useRecipeStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as recipesApi from '@/api/recipes'
import type {
  Recipe,
  RecipeCreatePayload,
  RecipeUpdatePayload,
  RecipeVersion,
} from '@/types/recipe'

export const useRecipeStore = defineStore('recipes', () => {
  const recipes = ref<Recipe[]>([])
  const currentRecipe = ref<Recipe | null>(null)
  const versions = ref<RecipeVersion[]>([])
  const loading = ref(false)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(true)

  async function fetchRecipes() {
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipes()
      recipes.value = data.items
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipes(nextCursor.value ?? undefined)
      recipes.value.push(...data.items)
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function fetchRecipe(id: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipe(id)
      currentRecipe.value = data
    } finally {
      loading.value = false
    }
  }

  async function createRecipe(payload: RecipeCreatePayload): Promise<Recipe> {
    const { data } = await recipesApi.createRecipe(payload)
    return data
  }

  async function updateRecipe(id: string, payload: RecipeUpdatePayload) {
    const { data } = await recipesApi.updateRecipe(id, payload)
    currentRecipe.value = data
  }

  async function deleteRecipe(id: string) {
    await recipesApi.deleteRecipe(id)
    recipes.value = recipes.value.filter((r) => r.id !== id)
  }

  async function fetchVersions(id: string) {
    const { data } = await recipesApi.getVersions(id)
    versions.value = data
  }

  async function restoreVersion(recipeId: string, versionId: string) {
    const { data } = await recipesApi.restoreVersion(recipeId, versionId)
    currentRecipe.value = data
    await fetchVersions(recipeId)
  }

  return {
    recipes,
    currentRecipe,
    versions,
    loading,
    nextCursor,
    hasMore,
    fetchRecipes,
    loadMore,
    fetchRecipe,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    fetchVersions,
    restoreVersion,
  }
})
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/stores/useRecipeStore.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/useRecipeStore.ts frontend/src/stores/useRecipeStore.test.ts
git commit -m "feat(frontend): add recipe Pinia store with CRUD, versioning, and pagination"
```

---

## Chunk 3: Router + Tag Constants

### Task 5: Router updates

**Files:**
- Modify: `frontend/src/router/index.ts`

Replace the `/recipes` placeholder with actual recipe routes. `/recipes/new` must be defined **before** `/recipes/:id` to prevent the param route from capturing "new".

- [ ] **Step 1: Update `frontend/src/router/index.ts`**

Replace the existing `/recipes` placeholder route with four routes:

```typescript
// Replace:
//   {
//     // Placeholder — replaced with RecipeListView in Phase 2
//     path: '/recipes',
//     name: 'recipes',
//     component: HomeView,
//     meta: { requiresAuth: true },
//   },
//
// With:
    {
      path: '/recipes',
      name: 'recipes',
      component: () => import('@/views/RecipeListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/recipes/new',
      name: 'recipe-create',
      component: () => import('@/views/RecipeCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/recipes/:id',
      name: 'recipe-detail',
      component: () => import('@/views/RecipeDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/recipes/:id/edit',
      name: 'recipe-edit',
      component: () => import('@/views/RecipeEditView.vue'),
      meta: { requiresAuth: true },
    },
```

Also remove the `import HomeView from '@/views/HomeView.vue'` at the top (it's no longer used by any route except `/admin`, which should also switch to lazy import).

Update the admin route to use lazy import too:

```typescript
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true, requiresSuperuser: true },
    },
```

- [ ] **Step 2: Create stub views so the router resolves**

Create minimal stubs for the 4 new views. These will be fully implemented in later tasks. Each stub is just a `<template><div>Stub</div></template>`.

`frontend/src/views/RecipeListView.vue`:
```vue
<template><div>RecipeListView stub</div></template>
```

`frontend/src/views/RecipeCreateView.vue`:
```vue
<template><div>RecipeCreateView stub</div></template>
```

`frontend/src/views/RecipeDetailView.vue`:
```vue
<template><div>RecipeDetailView stub</div></template>
```

`frontend/src/views/RecipeEditView.vue`:
```vue
<template><div>RecipeEditView stub</div></template>
```

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run existing router tests to verify no regressions**

```bash
cd frontend && npx vitest run src/router/router.test.ts
```

Expected: all existing router tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/views/RecipeListView.vue frontend/src/views/RecipeCreateView.vue frontend/src/views/RecipeDetailView.vue frontend/src/views/RecipeEditView.vue
git commit -m "feat(frontend): add recipe routes and stub views"
```

---

## Chunk 4: Leaf Components

These components have no dependencies on other new components and can be built in parallel.

### Task 6: RecipeCard component

**Files:**
- Create: `frontend/src/components/RecipeCard.vue`

Displays recipe title, up to 3 tag chips ("+N more" if >3), total_time_minutes, and servings. Click navigates to `/recipes/:id`.

- [ ] **Step 1: Write `frontend/src/components/RecipeCard.vue`**

```vue
<!-- frontend/src/components/RecipeCard.vue -->
<script setup lang="ts">
import type { Recipe } from '@/types/recipe'

const props = defineProps<{
  recipe: Recipe
}>()

const MAX_VISIBLE_TAGS = 3
const visibleTags = props.recipe.current_version.tags.slice(0, MAX_VISIBLE_TAGS)
const extraTagCount = Math.max(0, props.recipe.current_version.tags.length - MAX_VISIBLE_TAGS)
</script>

<template>
  <RouterLink :to="`/recipes/${recipe.id}`" class="recipe-card">
    <h3 class="recipe-card__title">{{ recipe.current_version.title }}</h3>
    <div class="recipe-card__meta">
      <span v-if="recipe.current_version.total_time_minutes">
        {{ recipe.current_version.total_time_minutes }} min
      </span>
      <span v-if="recipe.current_version.servings">
        {{ recipe.current_version.servings }} servings
      </span>
    </div>
    <div v-if="recipe.current_version.tags.length" class="recipe-card__tags">
      <span v-for="tag in visibleTags" :key="tag" class="recipe-card__tag">{{ tag }}</span>
      <span v-if="extraTagCount" class="recipe-card__tag recipe-card__tag--more">
        +{{ extraTagCount }} more
      </span>
    </div>
  </RouterLink>
</template>

<style scoped>
.recipe-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
}

.recipe-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.recipe-card__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.recipe-card__meta {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: #6b7280;
}

.recipe-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.recipe-card__tag {
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.75rem;
  color: #374151;
}

.recipe-card__tag--more {
  background: #e5e7eb;
  color: #6b7280;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/RecipeCard.vue
git commit -m "feat(frontend): add RecipeCard component"
```

---

### Task 7: TagSelector component

**Files:**
- Create: `frontend/src/components/TagSelector.vue`

Pre-built tags grouped by category. Toggle chips. Uses `defineModel` for `v-model` binding on `string[]`.

The tag categories and their values must match `backend/app/core/constants.py`:
- **Protein:** vegan, vegetarian, fish, poultry, meat, seafood
- **Diet:** low-calorie, high-calorie, low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean
- **Season:** spring, summer, autumn, winter
- **Meal type:** breakfast, lunch, dinner, snack, dessert
- **Cuisine:** italian, mexican, japanese, chinese, indian, thai, french, greek, middle-eastern, american, korean

- [ ] **Step 1: Write `frontend/src/components/TagSelector.vue`**

```vue
<!-- frontend/src/components/TagSelector.vue -->
<script setup lang="ts">

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

function toggle(tag: string) {
  const current = model.value
  if (current.includes(tag)) {
    model.value = current.filter((t) => t !== tag)
  } else {
    model.value = [...current, tag]
  }
}
</script>

<template>
  <div class="tag-selector">
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

<style scoped>
.tag-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tag-selector__group {
  border: none;
  padding: 0;
  margin: 0;
}

.tag-selector__legend {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.375rem;
}

.tag-selector__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.tag-selector__chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 1rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.1s;
}

.tag-selector__chip--active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TagSelector.vue
git commit -m "feat(frontend): add TagSelector grouped toggle chips component"
```

---

### Task 8: IngredientDrawer component

**Files:**
- Create: `frontend/src/components/IngredientDrawer.vue`

Bottom drawer overlay for editing a single ingredient. Fields: name (text), quantity (text — backend uses string type), unit (dropdown of common units + freeform "other"). Emits `save`, `delete`, `close`.

Common units from `backend/app/core/constants.py`: g, kg, ml, l, cup, tbsp, tsp, oz, lb, piece, slice, bunch, clove, can, package, pinch, dash, whole.

- [ ] **Step 1: Write `frontend/src/components/IngredientDrawer.vue`**

```vue
<!-- frontend/src/components/IngredientDrawer.vue -->
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import type { Ingredient } from '@/types/recipe'

const props = defineProps<{
  ingredient: Ingredient | null
}>()

const emit = defineEmits<{
  save: [ingredient: Ingredient]
  delete: []
  close: []
}>()

const COMMON_UNITS = [
  'g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'oz', 'lb',
  'piece', 'slice', 'bunch', 'clove', 'can', 'package', 'pinch', 'dash', 'whole',
]

const name = ref('')
const quantity = ref('')
const unit = ref('')
const useCustomUnit = ref(false)
const customUnit = ref('')

watchEffect(() => {
  const ing = props.ingredient
  name.value = ing?.name ?? ''
  quantity.value = ing?.quantity ?? ''
  const u = ing?.unit ?? ''
  if (u && !COMMON_UNITS.includes(u)) {
    useCustomUnit.value = true
    customUnit.value = u
    unit.value = ''
  } else {
    useCustomUnit.value = false
    customUnit.value = ''
    unit.value = u
  }
})

function save() {
  if (!name.value.trim()) return
  const finalUnit = useCustomUnit.value ? customUnit.value.trim() : unit.value
  emit('save', {
    name: name.value.trim(),
    quantity: quantity.value.trim(),
    unit: finalUnit || null,
  })
}
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <div class="drawer">
      <h3 class="drawer__title">{{ ingredient ? 'Edit ingredient' : 'Add ingredient' }}</h3>

      <label for="ing-name">Name</label>
      <input id="ing-name" v-model="name" type="text" placeholder="e.g. spaghetti" />

      <label for="ing-qty">Quantity</label>
      <input id="ing-qty" v-model="quantity" type="text" placeholder="e.g. 400" />

      <label for="ing-unit">Unit</label>
      <div v-if="!useCustomUnit">
        <select id="ing-unit" v-model="unit">
          <option value="">None</option>
          <option v-for="u in COMMON_UNITS" :key="u" :value="u">{{ u }}</option>
        </select>
        <button type="button" class="link-btn" @click="useCustomUnit = true">Other unit</button>
      </div>
      <div v-else>
        <input id="ing-unit" v-model="customUnit" type="text" placeholder="Custom unit" />
        <button type="button" class="link-btn" @click="useCustomUnit = false">Use list</button>
      </div>

      <div class="drawer__actions">
        <button type="button" class="btn btn--primary" @click="save" :disabled="!name.trim()">
          Save
        </button>
        <button v-if="ingredient" type="button" class="btn btn--danger" @click="emit('delete')">
          Delete
        </button>
        <button type="button" class="btn btn--secondary" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.drawer {
  width: 100%;
  background: white;
  border-radius: 1rem 1rem 0 0;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 80vh;
  overflow-y: auto;
}

.drawer__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}

label {
  font-size: 0.875rem;
  font-weight: 500;
}

input, select {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  width: 100%;
  box-sizing: border-box;
}

.link-btn {
  background: none;
  border: none;
  color: #2563eb;
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0.25rem 0;
}

.drawer__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.btn {
  flex: 1;
  padding: 0.625rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}

.btn--primary {
  background: #2563eb;
  color: white;
}

.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--danger {
  background: #dc2626;
  color: white;
}

.btn--secondary {
  background: #f3f4f6;
  color: #374151;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/IngredientDrawer.vue
git commit -m "feat(frontend): add IngredientDrawer bottom sheet component"
```

---

### Task 9: StepDrawer component

**Files:**
- Create: `frontend/src/components/StepDrawer.vue`

Bottom drawer for editing a single step. Fields: instruction (textarea), step number (read-only display). Emits `save`, `delete`, `close`.

- [ ] **Step 1: Write `frontend/src/components/StepDrawer.vue`**

```vue
<!-- frontend/src/components/StepDrawer.vue -->
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import type { Step } from '@/types/recipe'

const props = defineProps<{
  step: Step | null
  stepNumber: number
}>()

const emit = defineEmits<{
  save: [step: Step]
  delete: []
  close: []
}>()

const instruction = ref('')

watchEffect(() => {
  instruction.value = props.step?.instruction ?? ''
})

function save() {
  if (!instruction.value.trim()) return
  emit('save', {
    order: props.stepNumber,
    instruction: instruction.value.trim(),
  })
}
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <div class="drawer">
      <h3 class="drawer__title">Step {{ stepNumber }}</h3>

      <label for="step-instruction">Instruction</label>
      <textarea
        id="step-instruction"
        v-model="instruction"
        rows="4"
        placeholder="Describe this step..."
      ></textarea>

      <div class="drawer__actions">
        <button
          type="button"
          class="btn btn--primary"
          @click="save"
          :disabled="!instruction.trim()"
        >
          Save
        </button>
        <button v-if="step" type="button" class="btn btn--danger" @click="emit('delete')">
          Delete
        </button>
        <button type="button" class="btn btn--secondary" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.drawer {
  width: 100%;
  background: white;
  border-radius: 1rem 1rem 0 0;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 80vh;
  overflow-y: auto;
}

.drawer__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}

label {
  font-size: 0.875rem;
  font-weight: 500;
}

textarea {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}

.drawer__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.btn {
  flex: 1;
  padding: 0.625rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}

.btn--primary {
  background: #2563eb;
  color: white;
}

.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--danger {
  background: #dc2626;
  color: white;
}

.btn--secondary {
  background: #f3f4f6;
  color: #374151;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/StepDrawer.vue
git commit -m "feat(frontend): add StepDrawer bottom sheet component"
```

---

### Task 10: VersionHistoryPanel component

**Files:**
- Create: `frontend/src/components/VersionHistoryPanel.vue`

Collapsible section showing version list. Each entry: version number, formatted date, "Restore" button (not shown for the current version). Emits `restore(versionId)`.

- [ ] **Step 1: Write `frontend/src/components/VersionHistoryPanel.vue`**

```vue
<!-- frontend/src/components/VersionHistoryPanel.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import type { RecipeVersion } from '@/types/recipe'

defineProps<{
  versions: RecipeVersion[]
  currentVersionNumber: number
}>()

const emit = defineEmits<{
  restore: [versionId: string]
}>()

const expanded = ref(false)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="version-panel">
    <button type="button" class="version-panel__toggle" @click="expanded = !expanded">
      Version history ({{ versions.length }})
      <span class="version-panel__arrow" :class="{ 'version-panel__arrow--open': expanded }">
        &#9662;
      </span>
    </button>

    <ul v-if="expanded" class="version-panel__list">
      <li v-for="version in versions" :key="version.id" class="version-panel__item">
        <div class="version-panel__info">
          <strong>v{{ version.version_number }}</strong>
          <span class="version-panel__date">{{ formatDate(version.created_at) }}</span>
          <span class="version-panel__title">{{ version.title }}</span>
        </div>
        <button
          v-if="version.version_number !== currentVersionNumber"
          type="button"
          class="version-panel__restore"
          @click="emit('restore', version.id)"
        >
          Restore
        </button>
        <span v-else class="version-panel__current">current</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.version-panel {
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}

.version-panel__toggle {
  background: none;
  border: none;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #374151;
  padding: 0;
}

.version-panel__arrow {
  transition: transform 0.15s;
}

.version-panel__arrow--open {
  transform: rotate(180deg);
}

.version-panel__list {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.version-panel__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.version-panel__info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.875rem;
}

.version-panel__date {
  color: #6b7280;
}

.version-panel__title {
  color: #9ca3af;
}

.version-panel__restore {
  background: none;
  border: 1px solid #2563eb;
  color: #2563eb;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

.version-panel__current {
  font-size: 0.8125rem;
  color: #9ca3af;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/VersionHistoryPanel.vue
git commit -m "feat(frontend): add VersionHistoryPanel collapsible component"
```

---

## Chunk 5: RecipeForm

### Task 11: RecipeForm component

**Files:**
- Create: `frontend/src/components/RecipeForm.vue`

**Dependencies:** TagSelector, IngredientDrawer, StepDrawer (Tasks 7-9).

The form for creating and editing recipes. Props: optional initial data and a submit label. Emits `submit(data)` and `cancel`.

Sections: title, description, servings, time fields, ingredients list (tap to edit via drawer), steps list (tap to edit via drawer), tag selector, visibility toggle.

Validation: submit disabled until title non-empty, at least 1 ingredient, at least 1 step.

- [ ] **Step 1: Write `frontend/src/components/RecipeForm.vue`**

```vue
<!-- frontend/src/components/RecipeForm.vue -->
<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import type { Ingredient, Step, RecipeCreatePayload } from '@/types/recipe'
import TagSelector from './TagSelector.vue'
import IngredientDrawer from './IngredientDrawer.vue'
import StepDrawer from './StepDrawer.vue'

const props = withDefaults(
  defineProps<{
    initialData?: Partial<RecipeCreatePayload>
    submitLabel?: string
  }>(),
  { submitLabel: 'Save' },
)

const emit = defineEmits<{
  submit: [data: RecipeCreatePayload]
  cancel: []
}>()

const title = ref('')
const description = ref('')
const servings = ref(2)
const prepTime = ref<number | undefined>(undefined)
const waitingTime = ref<number | undefined>(undefined)
const cookTime = ref<number | undefined>(undefined)
const ingredients = ref<Ingredient[]>([])
const steps = ref<Step[]>([])
const tags = ref<string[]>([])
const visibility = ref<'private' | 'shared'>('private')

watchEffect(() => {
  const d = props.initialData
  if (!d) return
  title.value = d.title ?? ''
  description.value = d.description ?? ''
  servings.value = d.servings ?? 2
  prepTime.value = d.prep_time_minutes ?? undefined
  waitingTime.value = d.waiting_time_minutes ?? undefined
  cookTime.value = d.cook_time_minutes ?? undefined
  ingredients.value = d.ingredients ? [...d.ingredients] : []
  steps.value = d.steps ? [...d.steps] : []
  tags.value = d.tags ? [...d.tags] : []
  visibility.value = d.visibility ?? 'private'
})

const isValid = computed(
  () => title.value.trim().length > 0 && ingredients.value.length > 0 && steps.value.length > 0,
)

// Ingredient drawer state
const showIngredientDrawer = ref(false)
const editingIngredientIndex = ref<number | null>(null)
const editingIngredient = computed(() =>
  editingIngredientIndex.value !== null ? ingredients.value[editingIngredientIndex.value] : null,
)

function openIngredientDrawer(index: number | null) {
  editingIngredientIndex.value = index
  showIngredientDrawer.value = true
}

function saveIngredient(ing: Ingredient) {
  if (editingIngredientIndex.value !== null) {
    ingredients.value[editingIngredientIndex.value] = ing
  } else {
    ingredients.value.push(ing)
  }
  showIngredientDrawer.value = false
}

function deleteIngredient() {
  if (editingIngredientIndex.value !== null) {
    ingredients.value.splice(editingIngredientIndex.value, 1)
  }
  showIngredientDrawer.value = false
}

// Step drawer state
const showStepDrawer = ref(false)
const editingStepIndex = ref<number | null>(null)
const editingStep = computed(() =>
  editingStepIndex.value !== null ? steps.value[editingStepIndex.value] : null,
)
const editingStepNumber = computed(() =>
  editingStepIndex.value !== null ? editingStepIndex.value + 1 : steps.value.length + 1,
)

function openStepDrawer(index: number | null) {
  editingStepIndex.value = index
  showStepDrawer.value = true
}

function saveStep(step: Step) {
  if (editingStepIndex.value !== null) {
    steps.value[editingStepIndex.value] = step
  } else {
    steps.value.push(step)
  }
  // Re-number all steps after save
  steps.value.forEach((s, i) => (s.order = i + 1))
  showStepDrawer.value = false
}

function deleteStep() {
  if (editingStepIndex.value !== null) {
    steps.value.splice(editingStepIndex.value, 1)
    steps.value.forEach((s, i) => (s.order = i + 1))
  }
  showStepDrawer.value = false
}

function submit() {
  if (!isValid.value) return
  emit('submit', {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    servings: servings.value,
    prep_time_minutes: prepTime.value ?? null,
    waiting_time_minutes: waitingTime.value ?? null,
    cook_time_minutes: cookTime.value ?? null,
    ingredients: ingredients.value,
    steps: steps.value,
    tags: tags.value,
    visibility: visibility.value,
  })
}

function formatIngredient(ing: Ingredient): string {
  const parts: string[] = []
  if (ing.quantity) parts.push(ing.quantity)
  if (ing.unit) parts.push(ing.unit)
  parts.push(ing.name)
  return parts.join(' ')
}
</script>

<template>
  <form class="recipe-form" @submit.prevent="submit" novalidate>
    <div class="recipe-form__field">
      <label for="rf-title">Title</label>
      <input id="rf-title" v-model="title" type="text" required />
    </div>

    <div class="recipe-form__field">
      <label for="rf-desc">Description</label>
      <textarea id="rf-desc" v-model="description" rows="2"></textarea>
    </div>

    <div class="recipe-form__row">
      <div class="recipe-form__field">
        <label for="rf-servings">Servings</label>
        <input id="rf-servings" v-model.number="servings" type="number" min="1" />
      </div>
      <div class="recipe-form__field">
        <label for="rf-prep">Prep (min)</label>
        <input id="rf-prep" v-model.number="prepTime" type="number" min="0" />
      </div>
      <div class="recipe-form__field">
        <label for="rf-wait">Wait (min)</label>
        <input id="rf-wait" v-model.number="waitingTime" type="number" min="0" />
      </div>
      <div class="recipe-form__field">
        <label for="rf-cook">Cook (min)</label>
        <input id="rf-cook" v-model.number="cookTime" type="number" min="0" />
      </div>
    </div>

    <!-- Ingredients -->
    <fieldset class="recipe-form__section">
      <legend>Ingredients</legend>
      <ul v-if="ingredients.length" class="recipe-form__list">
        <li
          v-for="(ing, i) in ingredients"
          :key="i"
          class="recipe-form__list-item"
          @click="openIngredientDrawer(i)"
        >
          {{ formatIngredient(ing) }}
        </li>
      </ul>
      <p v-else class="recipe-form__empty">No ingredients yet.</p>
      <button type="button" class="recipe-form__add-btn" @click="openIngredientDrawer(null)">
        + Add ingredient
      </button>
    </fieldset>

    <!-- Steps -->
    <fieldset class="recipe-form__section">
      <legend>Steps</legend>
      <ol v-if="steps.length" class="recipe-form__list recipe-form__list--numbered">
        <li
          v-for="(step, i) in steps"
          :key="i"
          class="recipe-form__list-item"
          @click="openStepDrawer(i)"
        >
          {{ step.instruction.length > 80 ? step.instruction.slice(0, 80) + '…' : step.instruction }}
        </li>
      </ol>
      <p v-else class="recipe-form__empty">No steps yet.</p>
      <button type="button" class="recipe-form__add-btn" @click="openStepDrawer(null)">
        + Add step
      </button>
    </fieldset>

    <!-- Tags -->
    <fieldset class="recipe-form__section">
      <legend>Tags</legend>
      <TagSelector v-model="tags" />
    </fieldset>

    <!-- Visibility -->
    <div class="recipe-form__field">
      <label>Visibility</label>
      <div class="recipe-form__toggle">
        <button
          type="button"
          :class="['recipe-form__toggle-btn', { active: visibility === 'private' }]"
          @click="visibility = 'private'"
        >
          Private
        </button>
        <button
          type="button"
          :class="['recipe-form__toggle-btn', { active: visibility === 'shared' }]"
          @click="visibility = 'shared'"
        >
          Shared
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div class="recipe-form__actions">
      <button type="submit" class="btn btn--primary" :disabled="!isValid">
        {{ submitLabel }}
      </button>
      <button type="button" class="btn btn--secondary" @click="emit('cancel')">Cancel</button>
    </div>

    <!-- Drawers -->
    <IngredientDrawer
      v-if="showIngredientDrawer"
      :ingredient="editingIngredient"
      @save="saveIngredient"
      @delete="deleteIngredient"
      @close="showIngredientDrawer = false"
    />
    <StepDrawer
      v-if="showStepDrawer"
      :step="editingStep"
      :step-number="editingStepNumber"
      @save="saveStep"
      @delete="deleteStep"
      @close="showStepDrawer = false"
    />
  </form>
</template>

<style scoped>
.recipe-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 640px;
}

.recipe-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.recipe-form__row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .recipe-form__row {
    grid-template-columns: repeat(4, 1fr);
  }
}

label {
  font-size: 0.875rem;
  font-weight: 500;
}

input, textarea, select {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  width: 100%;
  box-sizing: border-box;
}

.recipe-form__section {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 0;
}

.recipe-form__section legend {
  font-size: 0.9375rem;
  font-weight: 600;
  padding: 0 0.25rem;
}

.recipe-form__list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
}

.recipe-form__list--numbered {
  list-style: decimal inside;
}

.recipe-form__list-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  font-size: 0.9375rem;
}

.recipe-form__list-item:hover {
  background: #f9fafb;
}

.recipe-form__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  margin: 0 0 0.5rem;
}

.recipe-form__add-btn {
  background: none;
  border: none;
  color: #2563eb;
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0.25rem 0;
}

.recipe-form__toggle {
  display: flex;
  gap: 0;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  overflow: hidden;
  width: fit-content;
}

.recipe-form__toggle-btn {
  padding: 0.5rem 1rem;
  background: white;
  border: none;
  font-size: 0.875rem;
  cursor: pointer;
}

.recipe-form__toggle-btn.active {
  background: #2563eb;
  color: white;
}

.recipe-form__actions {
  display: flex;
  gap: 0.75rem;
}

.btn {
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}

.btn--primary {
  background: #2563eb;
  color: white;
}

.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--secondary {
  background: #f3f4f6;
  color: #374151;
}
</style>
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RecipeForm.vue
git commit -m "feat(frontend): add RecipeForm with ingredient/step drawers and validation"
```

---

## Chunk 6: Views

### Task 12: RecipeListView

**Files:**
- Modify: `frontend/src/views/RecipeListView.vue` (replace stub)

Responsive grid of RecipeCards. "Load more" button when `hasMore` is true. Floating action button navigates to `/recipes/new`.

- [ ] **Step 1: Write `frontend/src/views/RecipeListView.vue`**

```vue
<!-- frontend/src/views/RecipeListView.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRecipeStore } from '@/stores/useRecipeStore'
import RecipeCard from '@/components/RecipeCard.vue'

const recipeStore = useRecipeStore()

onMounted(() => {
  recipeStore.fetchRecipes()
})
</script>

<template>
  <main class="recipe-list-page">
    <header class="recipe-list-page__header">
      <h1>Recipes</h1>
    </header>

    <p v-if="recipeStore.loading && !recipeStore.recipes.length" class="recipe-list-page__loading">
      Loading recipes…
    </p>

    <p
      v-else-if="!recipeStore.recipes.length"
      class="recipe-list-page__empty"
    >
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/RecipeListView.vue
git commit -m "feat(frontend): add RecipeListView with responsive grid and pagination"
```

---

### Task 13: RecipeDetailView

**Files:**
- Modify: `frontend/src/views/RecipeDetailView.vue` (replace stub)

Full recipe display with edit/delete buttons (owner-only), version history panel. Handles 404 with a "not found" message.

- [ ] **Step 1: Write `frontend/src/views/RecipeDetailView.vue`**

```vue
<!-- frontend/src/views/RecipeDetailView.vue -->
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import VersionHistoryPanel from '@/components/VersionHistoryPanel.vue'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const userStore = useUserStore()

const error = ref('')
const deleting = ref(false)

const recipe = computed(() => recipeStore.currentRecipe)
const isOwner = computed(() => recipe.value?.owner_id === userStore.user?.id)

onMounted(async () => {
  try {
    await recipeStore.fetchRecipe(route.params.id as string)
    await recipeStore.fetchVersions(route.params.id as string)
  } catch (e: any) {
    error.value = e.response?.status === 404 ? 'Recipe not found.' : 'Failed to load recipe.'
  }
})

async function handleDelete() {
  if (!recipe.value || !confirm('Delete this recipe? This cannot be undone.')) return
  deleting.value = true
  try {
    await recipeStore.deleteRecipe(recipe.value.id)
    router.push('/recipes')
  } catch {
    error.value = 'Failed to delete recipe.'
    deleting.value = false
  }
}

async function handleRestore(versionId: string) {
  if (!recipe.value) return
  try {
    await recipeStore.restoreVersion(recipe.value.id, versionId)
  } catch {
    error.value = 'Failed to restore version.'
  }
}

function formatIngredient(ing: { name: string; quantity: string; unit: string | null }): string {
  const parts: string[] = []
  if (ing.quantity) parts.push(ing.quantity)
  if (ing.unit) parts.push(ing.unit)
  parts.push(ing.name)
  return parts.join(' ')
}
</script>

<template>
  <main class="recipe-detail">
    <div v-if="error" class="recipe-detail__error">
      <p>{{ error }}</p>
      <RouterLink to="/recipes">Back to recipes</RouterLink>
    </div>

    <div v-else-if="recipeStore.loading && !recipe" class="recipe-detail__loading">
      Loading…
    </div>

    <template v-else-if="recipe">
      <header class="recipe-detail__header">
        <h1>{{ recipe.current_version.title }}</h1>
        <div v-if="isOwner" class="recipe-detail__owner-actions">
          <RouterLink :to="`/recipes/${recipe.id}/edit`" class="btn btn--secondary">
            Edit
          </RouterLink>
          <button
            class="btn btn--danger"
            :disabled="deleting"
            @click="handleDelete"
          >
            {{ deleting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </header>

      <p v-if="recipe.current_version.description" class="recipe-detail__description">
        {{ recipe.current_version.description }}
      </p>

      <div class="recipe-detail__meta">
        <span v-if="recipe.current_version.servings">
          {{ recipe.current_version.servings }} servings
        </span>
        <span v-if="recipe.current_version.total_time_minutes">
          {{ recipe.current_version.total_time_minutes }} min total
        </span>
        <span v-if="recipe.current_version.prep_time_minutes">
          {{ recipe.current_version.prep_time_minutes }} min prep
        </span>
        <span v-if="recipe.current_version.cook_time_minutes">
          {{ recipe.current_version.cook_time_minutes }} min cook
        </span>
        <span class="recipe-detail__badge">
          {{ recipe.visibility }}
        </span>
      </div>

      <section class="recipe-detail__section">
        <h2>Ingredients</h2>
        <ul class="recipe-detail__ingredients">
          <li v-for="(ing, i) in recipe.current_version.ingredients" :key="i">
            {{ formatIngredient(ing) }}
          </li>
        </ul>
      </section>

      <section class="recipe-detail__section">
        <h2>Steps</h2>
        <ol class="recipe-detail__steps">
          <li v-for="step in recipe.current_version.steps" :key="step.order">
            {{ step.instruction }}
          </li>
        </ol>
      </section>

      <section v-if="recipe.current_version.tags.length" class="recipe-detail__section">
        <h2>Tags</h2>
        <div class="recipe-detail__tags">
          <span v-for="tag in recipe.current_version.tags" :key="tag" class="recipe-detail__tag">
            {{ tag }}
          </span>
        </div>
      </section>

      <VersionHistoryPanel
        v-if="recipeStore.versions.length"
        :versions="recipeStore.versions"
        :current-version-number="recipe.current_version.version_number"
        @restore="handleRestore"
      />
    </template>
  </main>
</template>

<style scoped>
.recipe-detail {
  padding: 1rem;
  max-width: 720px;
  margin: 0 auto;
}

.recipe-detail__error {
  text-align: center;
  padding: 3rem 0;
  color: #dc2626;
}

.recipe-detail__error a {
  display: inline-block;
  margin-top: 1rem;
  color: #2563eb;
}

.recipe-detail__loading {
  text-align: center;
  padding: 3rem 0;
  color: #6b7280;
}

.recipe-detail__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.recipe-detail__header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}

.recipe-detail__owner-actions {
  display: flex;
  gap: 0.5rem;
}

.recipe-detail__description {
  color: #4b5563;
  margin: 0.5rem 0 0;
}

.recipe-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 1rem 0;
  font-size: 0.875rem;
  color: #6b7280;
}

.recipe-detail__badge {
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.75rem;
  text-transform: capitalize;
}

.recipe-detail__section {
  margin: 1.5rem 0;
}

.recipe-detail__section h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.recipe-detail__ingredients {
  list-style: disc inside;
  padding: 0;
  margin: 0;
}

.recipe-detail__ingredients li {
  padding: 0.25rem 0;
}

.recipe-detail__steps {
  padding-left: 1.25rem;
  margin: 0;
}

.recipe-detail__steps li {
  padding: 0.375rem 0;
  line-height: 1.5;
}

.recipe-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.recipe-detail__tag {
  padding: 0.25rem 0.625rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.8125rem;
  color: #374151;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  text-decoration: none;
}

.btn--secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn--danger {
  background: #dc2626;
  color: white;
}

.btn--danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/RecipeDetailView.vue
git commit -m "feat(frontend): add RecipeDetailView with version history and owner actions"
```

---

### Task 14: RecipeCreateView

**Files:**
- Modify: `frontend/src/views/RecipeCreateView.vue` (replace stub)

Wraps RecipeForm with empty initial state. On save: calls `createRecipe()`, navigates to detail.

- [ ] **Step 1: Write `frontend/src/views/RecipeCreateView.vue`**

```vue
<!-- frontend/src/views/RecipeCreateView.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import RecipeForm from '@/components/RecipeForm.vue'
import type { RecipeCreatePayload } from '@/types/recipe'

const router = useRouter()
const recipeStore = useRecipeStore()
const error = ref('')
const saving = ref(false)

async function handleSubmit(data: RecipeCreatePayload) {
  error.value = ''
  saving.value = true
  try {
    const recipe = await recipeStore.createRecipe(data)
    router.push(`/recipes/${recipe.id}`)
  } catch {
    error.value = 'Failed to create recipe. Please try again.'
    saving.value = false
  }
}
</script>

<template>
  <main class="recipe-create-page">
    <h1>New recipe</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <RecipeForm submit-label="Create recipe" @submit="handleSubmit" @cancel="router.back()" />
  </main>
</template>

<style scoped>
.recipe-create-page {
  padding: 1rem;
  max-width: 720px;
  margin: 0 auto;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.error {
  color: #dc2626;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/RecipeCreateView.vue
git commit -m "feat(frontend): add RecipeCreateView wrapping RecipeForm"
```

---

### Task 15: RecipeEditView

**Files:**
- Modify: `frontend/src/views/RecipeEditView.vue` (replace stub)

Wraps RecipeForm pre-populated from currentRecipe. Redirects to detail if user is not the owner. On save: calls `updateRecipe()`, navigates to detail.

- [ ] **Step 1: Write `frontend/src/views/RecipeEditView.vue`**

```vue
<!-- frontend/src/views/RecipeEditView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import RecipeForm from '@/components/RecipeForm.vue'
import type { RecipeCreatePayload, RecipeUpdatePayload } from '@/types/recipe'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const userStore = useUserStore()
const error = ref('')
const ready = ref(false)

const recipeId = route.params.id as string

const initialData = computed<Partial<RecipeCreatePayload> | undefined>(() => {
  const r = recipeStore.currentRecipe
  if (!r) return undefined
  const v = r.current_version
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
    visibility: r.visibility,
  }
})

onMounted(async () => {
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
</script>

<template>
  <main class="recipe-edit-page">
    <div v-if="!ready && !error" class="recipe-edit-page__loading">Loading…</div>

    <template v-else-if="ready && initialData">
      <h1>Edit recipe</h1>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <RecipeForm
        :initial-data="initialData"
        submit-label="Save changes"
        @submit="handleSubmit"
        @cancel="router.push(`/recipes/${recipeId}`)"
      />
    </template>
  </main>
</template>

<style scoped>
.recipe-edit-page {
  padding: 1rem;
  max-width: 720px;
  margin: 0 auto;
}

.recipe-edit-page__loading {
  text-align: center;
  padding: 3rem 0;
  color: #6b7280;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.error {
  color: #dc2626;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/RecipeEditView.vue
git commit -m "feat(frontend): add RecipeEditView with owner guard and pre-populated form"
```

---

## Chunk 7: Final Verification

### Task 16: Type-check and test sweep

- [ ] **Step 1: Run full type-check**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run all frontend unit tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass (store tests + existing router/user tests).

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors (or only pre-existing warnings unrelated to new code).

- [ ] **Step 4: Fix any issues found in steps 1-3**

If type-check or tests fail, fix the issues and re-run. Do not commit broken code.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u frontend/
git commit -m "fix(frontend): resolve type-check and lint issues in recipe UI"
```

(Skip this step if no fixes were needed.)
