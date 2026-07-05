// frontend/src/views/RecipeDetailView.test.ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recipe } from '@/types/recipe'

// Mock vue-router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'recipe-1' } }),
  useRouter: () => ({ push: mockPush }),
  RouterLink: { template: '<a><slot /></a>' },
}))

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1',
    owner_id: 'user-1',
    visibility: 'private',
    current_version: {
      id: 'version-1',
      recipe_id: 'recipe-1',
      version_number: 1,
      title: 'Test Soup',
      description: 'A cozy soup.',
      ingredients: [{ name: 'carrot', quantity: '2', unit: null }],
      steps: [{ order: 1, instruction: 'Chop the carrots.' }],
      servings: 2,
      prep_time_minutes: 10,
      waiting_time_minutes: null,
      cook_time_minutes: 20,
      total_time_minutes: 30,
      tags: [],
      recipe_source: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    times_cooked: 0,
    last_cooked_at: null,
    ...overrides,
  }
}

// Mock recipe store
const fetchRecipe = vi.fn()
const fetchVersions = vi.fn()
const updateRecipe = vi.fn()
const deleteRecipe = vi.fn()
const restoreVersion = vi.fn()

vi.mock('@/stores/useRecipeStore', () => ({
  useRecipeStore: vi.fn(() => ({
    currentRecipe: makeRecipe(),
    versions: [],
    loading: false,
    fetchRecipe,
    fetchVersions,
    updateRecipe,
    deleteRecipe,
    restoreVersion,
  })),
}))

// Mock user store
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: vi.fn(() => ({
    user: { id: 'user-1' },
  })),
}))

import { useRecipeStore } from '@/stores/useRecipeStore'
import RecipeDetailView from './RecipeDetailView.vue'

function mockRecipeStore(overrides: Record<string, unknown> = {}) {
  vi.mocked(useRecipeStore).mockReturnValue({
    currentRecipe: makeRecipe(),
    versions: [],
    loading: false,
    fetchRecipe,
    fetchVersions,
    updateRecipe,
    deleteRecipe,
    restoreVersion,
    ...overrides,
  } as unknown as ReturnType<typeof useRecipeStore>)
}

const globalStubs = {
  AddToPlanButton: true,
  VersionHistoryPanel: true,
}

describe('RecipeDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    fetchRecipe.mockResolvedValue(undefined)
    fetchVersions.mockResolvedValue(undefined)
    mockRecipeStore()
  })

  it('renders the recipe title', async () => {
    const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Test Soup')
  })

  it('initializes the servings Stepper to the recipe base servings', async () => {
    const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('.stepper__value').text()).toBe('2')
  })

  it('scales ingredient quantities when the stepper value increases', async () => {
    mockRecipeStore({
      currentRecipe: makeRecipe({
        current_version: {
          ...makeRecipe().current_version,
          servings: 2,
          ingredients: [{ name: 'carrot', quantity: '2', unit: null }],
        },
      }),
    })
    const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
    await flushPromises()

    // Base: servings 2, ingredient quantity "2"
    expect(wrapper.find('.recipe-detail__ingredients li').text()).toBe('2 carrot')

    // Bump the stepper to 4 by emitting update:modelValue directly.
    const stepper = wrapper.findComponent({ name: 'Stepper' })
    await stepper.vm.$emit('update:modelValue', 4)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.recipe-detail__ingredients li').text()).toBe('4 carrot')
  })

  it('never calls a store mutation as a side effect of scaling servings', async () => {
    const recipe = makeRecipe()
    mockRecipeStore({ currentRecipe: recipe })
    const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
    await flushPromises()

    const originalIngredients = JSON.stringify(recipe.current_version.ingredients)
    const originalServings = recipe.current_version.servings

    const stepper = wrapper.findComponent({ name: 'Stepper' })
    await stepper.vm.$emit('update:modelValue', 6)
    await wrapper.vm.$nextTick()

    expect(updateRecipe).not.toHaveBeenCalled()
    expect(deleteRecipe).not.toHaveBeenCalled()
    expect(restoreVersion).not.toHaveBeenCalled()
    // The underlying store recipe object itself must be untouched — scaling
    // is presentational only, never written back into recipe state.
    expect(JSON.stringify(recipe.current_version.ingredients)).toBe(originalIngredients)
    expect(recipe.current_version.servings).toBe(originalServings)
  })

  it('renders a two-column grid wrapper around Ingredients and Steps', async () => {
    const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
    await flushPromises()
    const grid = wrapper.find('.recipe-detail__columns')
    expect(grid.exists()).toBe(true)
    expect(grid.findAll('section')).toHaveLength(2)
  })
})

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
