// frontend/src/stores/useRecipeStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'
import type { Recipe, RecipeVersion } from '@/types/recipe'
import type { PaginatedResponse } from '@/types/common'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

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

const mockVersion: RecipeVersion = {
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

const mockRecipe: Recipe = {
  id: 'r1',
  owner_id: 'u1',
  visibility: 'private',
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
    vi.mocked(recipesApi.getRecipes).mockResolvedValueOnce(
      axiosOk<PaginatedResponse<Recipe>>({ items: [mockRecipe], next_cursor: 'abc', has_more: true }),
    )

    const store = useRecipeStore()
    await store.fetchRecipes()

    expect(store.recipes).toEqual([mockRecipe])
    expect(store.nextCursor).toBe('abc')
    expect(store.hasMore).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('fetchRecipes resets state on fresh load', async () => {
    vi.mocked(recipesApi.getRecipes).mockResolvedValueOnce(
      axiosOk<PaginatedResponse<Recipe>>({ items: [mockRecipe], next_cursor: null, has_more: false }),
    )

    const store = useRecipeStore()
    store.recipes = [mockRecipe, mockRecipe]
    store.nextCursor = 'old'

    await store.fetchRecipes()

    expect(store.recipes).toEqual([mockRecipe])
    expect(store.nextCursor).toBeNull()
    expect(store.hasMore).toBe(false)
  })

  it('loadMore appends to existing recipes', async () => {
    const secondRecipe = { ...mockRecipe, id: 'r2' }
    vi.mocked(recipesApi.getRecipes).mockResolvedValueOnce(
      axiosOk<PaginatedResponse<Recipe>>({ items: [secondRecipe], next_cursor: null, has_more: false }),
    )

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
    vi.mocked(recipesApi.getRecipe).mockResolvedValueOnce(axiosOk<Recipe>(mockRecipe))

    const store = useRecipeStore()
    await store.fetchRecipe('r1')

    expect(store.currentRecipe).toEqual(mockRecipe)
    expect(recipesApi.getRecipe).toHaveBeenCalledWith('r1')
  })

  it('createRecipe calls API and returns the created recipe', async () => {
    vi.mocked(recipesApi.createRecipe).mockResolvedValueOnce(axiosOk<Recipe>(mockRecipe))

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
    vi.mocked(recipesApi.updateRecipe).mockResolvedValueOnce(axiosOk<Recipe>(updated))

    const store = useRecipeStore()
    store.currentRecipe = mockRecipe
    await store.updateRecipe('r1', { title: 'Updated Title' })

    expect(store.currentRecipe).toEqual(updated)
    expect(recipesApi.updateRecipe).toHaveBeenCalledWith('r1', { title: 'Updated Title' })
  })

  it('deleteRecipe calls API and removes recipe from local list', async () => {
    vi.mocked(recipesApi.deleteRecipe).mockResolvedValueOnce(axiosOk<unknown>(null))

    const store = useRecipeStore()
    store.recipes = [mockRecipe, { ...mockRecipe, id: 'r2' }]

    await store.deleteRecipe('r1')

    expect(store.recipes).toHaveLength(1)
    expect(store.recipes[0].id).toBe('r2')
    expect(recipesApi.deleteRecipe).toHaveBeenCalledWith('r1')
  })

  it('deleteRecipe clears currentRecipe if it was the deleted recipe', async () => {
    vi.mocked(recipesApi.deleteRecipe).mockResolvedValueOnce(axiosOk<unknown>(null))

    const store = useRecipeStore()
    store.currentRecipe = mockRecipe
    store.recipes = [mockRecipe]

    await store.deleteRecipe('r1')

    expect(store.currentRecipe).toBeNull()
  })

  it('fetchVersions populates versions list', async () => {
    const v2 = { ...mockVersion, id: 'v2', version_number: 2, title: 'Updated' }
    vi.mocked(recipesApi.getVersions).mockResolvedValueOnce(axiosOk<RecipeVersion[]>([v2, mockVersion]))

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
    vi.mocked(recipesApi.restoreVersion).mockResolvedValueOnce(axiosOk<Recipe>(restored))
    vi.mocked(recipesApi.getVersions).mockResolvedValueOnce(
      axiosOk<RecipeVersion[]>([restored.current_version, mockVersion]),
    )

    const store = useRecipeStore()
    store.currentRecipe = mockRecipe
    await store.restoreVersion('r1', 'v1')

    expect(store.currentRecipe).toEqual(restored)
    expect(recipesApi.restoreVersion).toHaveBeenCalledWith('r1', 'v1')
    expect(recipesApi.getVersions).toHaveBeenCalledWith('r1')
  })
})
