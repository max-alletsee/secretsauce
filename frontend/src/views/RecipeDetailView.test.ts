// frontend/src/views/RecipeDetailView.test.ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
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

  describe('ingredient checkoff', () => {
    it('toggles checked state and applies a done class when an ingredient checkbox is checked', async () => {
      mockRecipeStore({
        currentRecipe: makeRecipe({
          current_version: {
            ...makeRecipe().current_version,
            ingredients: [
              { name: 'carrot', quantity: '2', unit: null },
              { name: 'onion', quantity: '1', unit: null },
            ],
          },
        }),
      })
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const items = wrapper.findAll('.recipe-detail__ingredients li')
      expect(items).toHaveLength(2)
      expect(items[0]!.classes()).not.toContain('is-done')

      const checkbox = items[0]!.find('input[type="checkbox"]')
      expect(checkbox.exists()).toBe(true)
      await checkbox.setValue(true)

      expect(items[0]!.classes()).toContain('is-done')
      // Untouched sibling remains unaffected.
      expect(items[1]!.classes()).not.toContain('is-done')
    })

    it('unchecking an ingredient removes the done class', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const item = wrapper.find('.recipe-detail__ingredients li')
      const checkbox = item.find('input[type="checkbox"]')
      await checkbox.setValue(true)
      expect(item.classes()).toContain('is-done')

      await checkbox.setValue(false)
      expect(item.classes()).not.toContain('is-done')
    })

    it('never calls a store mutation as a side effect of checking ingredients', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const checkbox = wrapper.find('.recipe-detail__ingredients input[type="checkbox"]')
      await checkbox.setValue(true)

      expect(updateRecipe).not.toHaveBeenCalled()
      expect(deleteRecipe).not.toHaveBeenCalled()
      expect(restoreVersion).not.toHaveBeenCalled()
    })
  })

  describe('step done-state + progress', () => {
    it('renders a ProgressBar reflecting 0 of N steps done initially', async () => {
      mockRecipeStore({
        currentRecipe: makeRecipe({
          current_version: {
            ...makeRecipe().current_version,
            steps: [
              { order: 1, instruction: 'Chop the carrots.' },
              { order: 2, instruction: 'Boil water.' },
            ],
          },
        }),
      })
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const progressBar = wrapper.findComponent({ name: 'ProgressBar' })
      expect(progressBar.exists()).toBe(true)
      expect(progressBar.props('value')).toBe(0)
      expect(progressBar.props('max')).toBe(2)
      expect(progressBar.props('label')).toBe('0 of 2 steps')
    })

    it('checking a step checkbox increments the ProgressBar value and label', async () => {
      mockRecipeStore({
        currentRecipe: makeRecipe({
          current_version: {
            ...makeRecipe().current_version,
            steps: [
              { order: 1, instruction: 'Chop the carrots.' },
              { order: 2, instruction: 'Boil water.' },
            ],
          },
        }),
      })
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const stepItems = wrapper.findAll('.recipe-detail__steps li')
      const firstCheckbox = stepItems[0]!.find('input[type="checkbox"]')
      await firstCheckbox.setValue(true)

      const progressBar = wrapper.findComponent({ name: 'ProgressBar' })
      expect(progressBar.props('value')).toBe(1)
      expect(progressBar.props('label')).toBe('1 of 2 steps')
      expect(stepItems[0]!.classes()).toContain('is-done')
    })

    it('never calls a store mutation as a side effect of checking steps', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const checkbox = wrapper.find('.recipe-detail__steps input[type="checkbox"]')
      await checkbox.setValue(true)

      expect(updateRecipe).not.toHaveBeenCalled()
      expect(deleteRecipe).not.toHaveBeenCalled()
      expect(restoreVersion).not.toHaveBeenCalled()
    })
  })

  describe('edit affordance', () => {
    it('navigates to the edit route when the edit icon button is clicked', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const editButton = wrapper.find('[aria-label="Edit recipe"]')
      expect(editButton.exists()).toBe(true)
      await editButton.trigger('click')

      expect(mockPush).toHaveBeenCalledWith('/recipes/recipe-1/edit')
    })
  })

  describe('overflow delete menu', () => {
    it('does not show the delete menu item until the overflow trigger is opened', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      expect(wrapper.find('[data-testid="delete-recipe"]').exists()).toBe(false)
    })

    it('opens the overflow menu and shows the Delete menu item', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const trigger = wrapper.find('[aria-label="More actions"]')
      expect(trigger.exists()).toBe(true)
      await trigger.trigger('click')

      const deleteItem = wrapper.find('[data-testid="delete-recipe"]')
      expect(deleteItem.exists()).toBe(true)
      expect(deleteItem.text()).toBe('Delete')
    })

    it('clicking Delete in the menu closes the menu and opens the ConfirmDialog', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await wrapper.find('[data-testid="delete-recipe"]').trigger('click')
      await wrapper.vm.$nextTick()

      // Menu should be closed now.
      expect(wrapper.find('[data-testid="delete-recipe"]').exists()).toBe(false)

      const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      expect(dialog.exists()).toBe(true)
      expect(dialog.props('open')).toBe(true)
      expect(dialog.props('title')).toBe('Delete recipe?')
    })

    it('confirming in the dialog calls deleteRecipe and navigates to /recipes', async () => {
      deleteRecipe.mockResolvedValue(undefined)
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await wrapper.find('[data-testid="delete-recipe"]').trigger('click')
      await wrapper.vm.$nextTick()

      const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      dialog.vm.$emit('confirm')
      await flushPromises()

      expect(deleteRecipe).toHaveBeenCalledWith('recipe-1')
      expect(mockPush).toHaveBeenCalledWith('/recipes')
    })

    it('canceling the dialog closes it without deleting', async () => {
      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await wrapper.find('[data-testid="delete-recipe"]').trigger('click')
      await wrapper.vm.$nextTick()

      let dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      expect(dialog.props('open')).toBe(true)

      dialog.vm.$emit('cancel')
      await wrapper.vm.$nextTick()

      dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      expect(dialog.props('open')).toBe(false)
      expect(deleteRecipe).not.toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalledWith('/recipes')
    })
  })

  describe('checkoff reset across recipe navigation', () => {
    it('clears ingredient and step checkoff state when the recipe id changes', async () => {
      // Use a reactive store stand-in so mutating `currentRecipe` in place
      // (simulating the store updating after a route param change, the way
      // Pinia would) is actually observed by the component's computed,
      // reproducing Vue Router's instance-reuse behavior for `/recipes/:id`.
      const recipeA = makeRecipe({ id: 'recipe-1' })
      const reactiveStore = reactive({
        currentRecipe: recipeA as Recipe,
        versions: [],
        loading: false,
        fetchRecipe,
        fetchVersions,
        updateRecipe,
        deleteRecipe,
        restoreVersion,
      })
      vi.mocked(useRecipeStore).mockReturnValue(
        reactiveStore as unknown as ReturnType<typeof useRecipeStore>,
      )

      const wrapper = mount(RecipeDetailView, { global: { stubs: globalStubs } })
      await flushPromises()

      const ingredientCheckbox = wrapper.find('.recipe-detail__ingredients input[type="checkbox"]')
      await ingredientCheckbox.setValue(true)
      const stepCheckbox = wrapper.find('.recipe-detail__steps input[type="checkbox"]')
      await stepCheckbox.setValue(true)

      expect(wrapper.find('.recipe-detail__ingredients li').classes()).toContain('is-done')
      const progressBarBefore = wrapper.findComponent({ name: 'ProgressBar' })
      expect(progressBarBefore.props('value')).toBe(1)

      // Simulate the router reusing this instance for a different recipe id
      // by having the (reactive) store swap in a different recipe.
      const recipeB = makeRecipe({
        id: 'recipe-2',
        current_version: {
          ...makeRecipe().current_version,
          ingredients: [{ name: 'flour', quantity: '3', unit: 'cups' }],
          steps: [{ order: 1, instruction: 'Mix.' }],
        },
      })
      reactiveStore.currentRecipe = recipeB
      await wrapper.vm.$nextTick()
      await flushPromises()

      expect(wrapper.find('.recipe-detail__ingredients li').classes()).not.toContain('is-done')
      const progressBarAfter = wrapper.findComponent({ name: 'ProgressBar' })
      expect(progressBarAfter.props('value')).toBe(0)
    })
  })
})

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
