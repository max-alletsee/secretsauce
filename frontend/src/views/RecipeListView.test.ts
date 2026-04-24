// frontend/src/views/RecipeListView.test.ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import type { AxiosResponse } from 'axios'
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'

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

// Mock importTasks API
vi.mock('@/api/importTasks', () => ({
  importRecipeFromUrl: vi.fn(),
  importRecipeFromImage: vi.fn(),
  getImportTask: vi.fn(),
}))

import * as importTasksApi from '@/api/importTasks'
import RecipeListView from './RecipeListView.vue'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

describe('RecipeListView — import flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows import form with url input and import button', () => {
    const wrapper = mount(RecipeListView)
    expect(wrapper.find('[data-testid="import-url-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="import-submit-btn"]').exists()).toBe(true)
  })

  it('disables input and shows spinner while importing', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-1', status: 'pending' }),
    )

    const wrapper = mount(RecipeListView)
    const input = wrapper.find('[data-testid="import-url-input"]')
    const button = wrapper.find('[data-testid="import-submit-btn"]')

    await input.setValue('https://example.com/recipe')
    await button.trigger('click')
    await wrapper.vm.$nextTick()

    expect((input.element as HTMLInputElement).disabled).toBe(true)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-testid="import-spinner"]').exists()).toBe(true)
  })

  it('navigates to edit view when task completes', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-1', status: 'pending' }),
    )
    vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
      axiosOk<ImportTask>({
        id: 'task-1',
        status: 'completed',
        recipe_id: 'recipe-42',
        error_message: null,
        import_type: 'url',
        result_data: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    )

    const wrapper = mount(RecipeListView)
    await wrapper.find('[data-testid="import-url-input"]').setValue('https://example.com/recipe')
    await wrapper.find('[data-testid="import-submit-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // advance the 3-second poll interval
    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.vm.$nextTick()

    expect(mockPush).toHaveBeenCalledWith({
      name: 'recipe-edit',
      params: { id: 'recipe-42' },
      state: { importedRecipe: null },
    })
  })

  it('shows error message and re-enables form when task fails', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-1', status: 'pending' }),
    )
    vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
      axiosOk<ImportTask>({
        id: 'task-1',
        status: 'failed',
        recipe_id: null,
        error_message: 'Could not extract recipe from page',
        import_type: 'url',
        result_data: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    )

    const wrapper = mount(RecipeListView)
    await wrapper.find('[data-testid="import-url-input"]').setValue('https://example.com/recipe')
    await wrapper.find('[data-testid="import-submit-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="import-error"]').text()).toContain(
      'Could not extract recipe from page',
    )
    const input = wrapper.find('[data-testid="import-url-input"]')
    expect((input.element as HTMLInputElement).disabled).toBe(false)
  })

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
        result_data: null,
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

    expect(mockPush).toHaveBeenCalledWith({
      name: 'recipe-edit',
      params: { id: 'recipe-img-99' },
      state: { importedRecipe: null },
    })
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
