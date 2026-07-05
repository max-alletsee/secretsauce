// frontend/src/views/RecipeListView.test.ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock vue-router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  RouterLink: { template: '<a><slot /></a>' },
}))

// Mock recipe store
vi.mock('@/stores/useRecipeStore', () => ({
  useRecipeStore: () => ({
    recipes: [],
    loading: false,
    hasMore: false,
    searchQuery: '',
    selectedTags: [],
    sortBy: 'created_at_desc',
    popularityAvailable: false,
    fetchRecipes: vi.fn(),
    loadMore: vi.fn(),
  }),
}))

// Mock importTasks API (still imported transitively via AddRecipeSheet)
vi.mock('@/api/importTasks', () => ({
  importRecipeFromUrl: vi.fn(),
  importRecipeFromImage: vi.fn(),
  getImportTask: vi.fn(),
}))

import RecipeListView from './RecipeListView.vue'

describe('RecipeListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders an "Add recipe" trigger', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="add-recipe-btn"]').exists()).toBe(true)
  })

  it('does not render the AddRecipeSheet until the trigger is clicked', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="add-recipe-sheet"]').exists()).toBe(false)
  })

  it('opens the AddRecipeSheet when the "Add recipe" button is clicked', async () => {
    const wrapper = mount(RecipeListView, { attachTo: document.body })
    await wrapper.find('[data-testid="add-recipe-btn"]').trigger('click')
    expect(document.body.querySelector('[data-testid="add-recipe-sheet"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('opens the AddRecipeSheet when the FAB is clicked', async () => {
    const wrapper = mount(RecipeListView, { attachTo: document.body })
    await wrapper.find('.fab').trigger('click')
    expect(document.body.querySelector('[data-testid="add-recipe-sheet"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('closes the AddRecipeSheet on the close event', async () => {
    const wrapper = mount(RecipeListView, { attachTo: document.body })
    await wrapper.find('[data-testid="add-recipe-btn"]').trigger('click')
    expect(document.body.querySelector('[data-testid="add-recipe-sheet"]')).toBeTruthy()

    const closeBtn = document.body.querySelector('[data-testid="sheet-close"]') as HTMLElement
    closeBtn.click()
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('[data-testid="add-recipe-sheet"]')).toBeFalsy()
    wrapper.unmount()
  })

  it('renders SearchBar component', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="recipe-search-bar"]').exists()).toBe(true)
  })

  it('renders SortControl component', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="recipe-sort-control"]').exists()).toBe(true)
  })

  it('renders TagFilter component', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="recipe-tag-filter"]').exists()).toBe(true)
  })
})
