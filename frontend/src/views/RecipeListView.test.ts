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
  useRecipeStore: vi.fn(() => ({
    recipes: [],
    loading: false,
    hasMore: false,
    searchQuery: '',
    selectedTags: [],
    sortBy: 'created_at_desc',
    popularityAvailable: false,
    fetchRecipes: vi.fn(),
    loadMore: vi.fn(),
  })),
}))

// Mock importTasks API (still imported transitively via AddRecipeSheet)
vi.mock('@/api/importTasks', () => ({
  importRecipeFromUrl: vi.fn(),
  importRecipeFromImage: vi.fn(),
  getImportTask: vi.fn(),
}))

import { useRecipeStore } from '@/stores/useRecipeStore'
import RecipeListView from './RecipeListView.vue'

function mockRecipeStore(overrides: Record<string, unknown> = {}) {
  vi.mocked(useRecipeStore).mockReturnValue({
    recipes: [],
    loading: false,
    hasMore: false,
    searchQuery: '',
    selectedTags: [],
    sortBy: 'created_at_desc',
    popularityAvailable: false,
    fetchRecipes: vi.fn(),
    loadMore: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useRecipeStore>)
}

describe('RecipeListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRecipeStore()
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

  it('renders skeleton cards when loading with no recipes yet', () => {
    mockRecipeStore({ loading: true, recipes: [] })
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="recipe-list-skeleton"]').exists()).toBe(true)
    expect(wrapper.findAll('.skeleton-card')).toHaveLength(6)
  })

  it('does not render the empty state while the initial load is in progress', () => {
    mockRecipeStore({ loading: true, recipes: [] })
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('renders EmptyState with the expected title and body when there are no recipes', () => {
    mockRecipeStore({ loading: false, recipes: [] })
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state__title').text()).toBe('No recipes yet')
    expect(wrapper.find('.empty-state__body').text()).toBe(
      'Import your first from a URL or snap a cookbook page',
    )
  })

  it('opens the AddRecipeSheet when the empty-state action button is clicked', async () => {
    mockRecipeStore({ loading: false, recipes: [] })
    const wrapper = mount(RecipeListView, { attachTo: document.body })
    await wrapper.find('[data-testid="empty-state-add-recipe-btn"]').trigger('click')
    expect(document.body.querySelector('[data-testid="add-recipe-sheet"]')).toBeTruthy()
    wrapper.unmount()
  })
})
