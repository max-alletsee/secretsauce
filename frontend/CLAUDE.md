# Frontend — CLAUDE.md

This file covers frontend-specific implementation conventions. For project overview, data model, API contract, and deployment, see the root `CLAUDE.md`.

## Framework & Tooling

- **Vue 3 Composition API only.** Never use Options API.
- **TypeScript throughout.** All components, composables, stores, and API files in TypeScript.
- **Vite** for dev server and build.
- **Pinia** for state management.
- **Vue Router** for routing with auth guards.
- **axios** for HTTP requests.

## Directory Responsibilities

- **`views/`** — Page-level components, one per route. These compose smaller components and connect to stores. Examples: `RecipeListView.vue`, `RecipeDetailView.vue`, `MealPlanView.vue`, `ShoppingListView.vue`, `LoginView.vue`, `AdminView.vue`.
- **`components/`** — Reusable UI components. Should not call API directly — receive data via props, emit events upward. Examples: `RecipeCard.vue`, `MealSlot.vue`, `IngredientRow.vue`, `TagFilter.vue`.
- **`composables/`** — Shared Vue composition functions for logic reuse across components. Examples: `useRecipes.ts`, `useMealPlan.ts`, `useAuth.ts`, `usePagination.ts`.
- **`stores/`** — Pinia state stores, one per domain. Stores call API functions and hold application state. Examples: `useRecipeStore.ts`, `useMealPlanStore.ts`, `useUserStore.ts`, `useShoppingListStore.ts`.
- **`api/`** — API client functions. One file per domain, all using a shared axios instance from `api/client.ts`. Examples: `api/recipes.ts`, `api/mealPlans.ts`, `api/auth.ts`, `api/shoppingLists.ts`.
- **`router/`** — Vue Router config. Auth guards check `useUserStore` for authentication state. Redirect unauthenticated users to `/login`.
- **`types/`** — TypeScript interfaces matching backend Pydantic response schemas. Keep in sync with backend `schemas/` directory. Examples: `types/recipe.ts`, `types/mealPlan.ts`, `types/user.ts`.
- **`assets/`** — Static assets (images, icons) and global CSS.

## Component Conventions

### Naming
- PascalCase for all components.
- Domain-prefixed for non-generic components: `RecipeCard`, `MealPlanDay`, `ShoppingListItem`.
- No prefix for generic/base components: `BaseButton`, `BaseModal`, `BaseInput`, `BaseSpinner`.

### Props & Events
- Define props with TypeScript interfaces using `defineProps<T>()`.
- Define emits with `defineEmits<T>()`.
- Never mutate props. Emit events for parent to handle state changes.

### Template Structure
```vue
<script setup lang="ts">
// imports, props, emits, composables, reactive state, computed, methods
</script>

<template>
  <!-- template -->
</template>

<style scoped>
/* scoped styles only */
</style>
```

Always use `<script setup>` syntax. Always use `scoped` styles.

## API Client Pattern

Centralized axios instance in `api/client.ts`:
```typescript
import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Auth token interceptor
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Token refresh interceptor on 401
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Attempt token refresh, retry original request, or redirect to login
    }
    return Promise.reject(error)
  }
)

export default client
```

Domain API files export typed functions:
```typescript
// api/recipes.ts
import client from './client'
import type { Recipe, RecipeCreate, PaginatedResponse } from '@/types/recipe'

export const getRecipes = (cursor?: string) =>
  client.get<PaginatedResponse<Recipe>>('/recipes', { params: { cursor } })

export const getRecipe = (id: string) =>
  client.get<Recipe>(`/recipes/${id}`)

export const createRecipe = (data: RecipeCreate) =>
  client.post<Recipe>('/recipes', data)
```

## State Management

One Pinia store per domain. Stores are the single source of truth for application state. Components read from stores; stores call API functions.

```typescript
// stores/useRecipeStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as recipesApi from '@/api/recipes'
import type { Recipe } from '@/types/recipe'

export const useRecipeStore = defineStore('recipes', () => {
  const recipes = ref<Recipe[]>([])
  const loading = ref(false)

  async function fetchRecipes(cursor?: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipes(cursor)
      recipes.value = data.items
    } finally {
      loading.value = false
    }
  }

  return { recipes, loading, fetchRecipes }
})
```

## Pagination

The backend uses cursor-based pagination. Frontend stores should track `nextCursor` and `hasMore` to support infinite scroll or "load more" patterns. Never use page numbers.

```typescript
const nextCursor = ref<string | null>(null)
const hasMore = ref(true)

async function loadMore() {
  if (!hasMore.value || loading.value) return
  loading.value = true
  const { data } = await recipesApi.getRecipes(nextCursor.value ?? undefined)
  recipes.value.push(...data.items)
  nextCursor.value = data.next_cursor
  hasMore.value = data.has_more
  loading.value = false
}
```

## Error Handling

The backend returns errors in this format:
```json
{
  "detail": "Human-readable error message",
  "error_code": "RECIPE_NOT_FOUND",
  "field_errors": [{"field": "title", "message": "Required"}]
}
```

Handle in API interceptors or per-call. Display `detail` to users. Map `field_errors` to form validation state. Use `error_code` for programmatic handling (e.g., redirect on `AUTH_TOKEN_EXPIRED`).

## Responsive Design

- **Mobile-first.** Write base styles for 375px, then add breakpoints upward.
- **Breakpoints:** 375px (phone), 768px (tablet), 1024px+ (desktop).
- **Use CSS flexbox and grid.** No CSS framework.
- **Scoped styles in Vue SFCs.** No global utility classes.
- **Test at all three breakpoints** during development.

```css
/* Mobile-first base */
.recipe-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

/* Tablet */
@media (min-width: 768px) {
  .recipe-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .recipe-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

## Routing

Use Vue Router with auth guards. Key routes:

- `/login` — LoginView (public)
- `/register` — RegisterView (public)
- `/recipes` — RecipeListView (auth required)
- `/recipes/:id` — RecipeDetailView (auth required)
- `/recipes/new` — RecipeCreateView (auth required)
- `/recipes/:id/edit` — RecipeEditView (auth required)
- `/meal-plans` — MealPlanListView (auth required)
- `/meal-plans/:id` — MealPlanDetailView (auth required)
- `/meal-plans/new` — MealPlanCreateView (auth required)
- `/shopping-lists/:mealPlanId` — ShoppingListView (auth required)
- `/admin` — AdminView (superuser required)

Auth guard pattern:
```typescript
router.beforeEach((to) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth && !userStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresSuperuser && !userStore.isSuperuser) {
    return { name: 'recipes' }
  }
})
```

## Testing

### Unit Tests (Vitest)

Test composables and store logic. Mock API calls via `vi.mock`.

```bash
npm run test:unit
```

### E2E Tests (Playwright)

Test critical user flows against the full Docker Compose stack (test environment):
- Login / register
- Create a recipe manually
- Import a recipe from URL
- Generate a meal plan
- Manage shopping list
- Admin user management

```bash
# Requires running test stack
docker compose -f docker-compose.test.yml up -d
npx playwright test
```
