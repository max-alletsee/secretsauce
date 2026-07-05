// frontend/src/components/AddRecipeSheet.test.ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { AxiosResponse } from 'axios'
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'

// Mock vue-router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock importTasks API
vi.mock('@/api/importTasks', () => ({
  importRecipeFromUrl: vi.fn(),
  importRecipeFromImage: vi.fn(),
  getImportTask: vi.fn(),
}))

import * as importTasksApi from '@/api/importTasks'
import AddRecipeSheet from './AddRecipeSheet.vue'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

// BottomSheet content is Teleport'd to document.body, so query there rather
// than through the mounted wrapper's root element.
function qs<E extends Element = HTMLElement>(sel: string): E {
  const el = document.body.querySelector<E>(sel)
  if (!el) throw new Error(`Selector not found: ${sel}`)
  return el
}
function qsAll<E extends Element = HTMLElement>(sel: string): E[] {
  return Array.from(document.body.querySelectorAll<E>(sel))
}

describe('AddRecipeSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders SegmentedTabs with url/photo/manual tabs, defaulting to url', () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    const tabs = qsAll('[role="tab"]')
    expect(tabs).toHaveLength(3)
    expect(document.body.textContent).toContain('From URL')
    expect(document.body.textContent).toContain('From photo')
    expect(document.body.textContent).toContain('Write manually')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    wrapper.unmount()
  })

  it('shows import form with url input and import button on the URL tab', () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    expect(document.body.querySelector('[data-testid="import-url-input"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="import-submit-btn"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('shows an image upload button', async () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()
    expect(document.body.querySelector('[data-testid="import-image-btn"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('switches panels when the photo tab is selected', async () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()
    expect(document.body.querySelector('[data-testid="import-image-btn"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="import-url-input"]')).toBeFalsy()
    wrapper.unmount()
  })

  it('navigates to recipe-create and closes when "Write manually" tab action is used', async () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[2]!.click()
    await flushPromises()
    const manualLink = qs('[data-testid="add-recipe-manual-link"]')
    manualLink.click()
    await flushPromises()
    expect(mockPush).toHaveBeenCalledWith({ name: 'recipe-create' })
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('disables input and shows spinner while importing', async () => {
    vi.mocked(importTasksApi.importRecipeFromUrl).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-1', status: 'pending' }),
    )

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    const input = qs<HTMLInputElement>('[data-testid="import-url-input"]')
    const button = qs<HTMLButtonElement>('[data-testid="import-submit-btn"]')

    input.value = 'https://example.com/recipe'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    button.click()
    await flushPromises()

    expect(input.disabled).toBe(true)
    expect(button.disabled).toBe(true)
    expect(document.body.querySelector('[data-testid="import-spinner"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('navigates to edit view when url task completes', async () => {
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

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    const input = qs<HTMLInputElement>('[data-testid="import-url-input"]')
    input.value = 'https://example.com/recipe'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    qs<HTMLButtonElement>('[data-testid="import-submit-btn"]').click()
    await flushPromises()

    // advance the 3-second poll interval
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(mockPush).toHaveBeenCalledWith({
      name: 'recipe-edit',
      params: { id: 'recipe-42' },
      state: { importedRecipe: null },
    })
    wrapper.unmount()
  })

  it('shows error message and re-enables form when url task fails', async () => {
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

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    const input = qs<HTMLInputElement>('[data-testid="import-url-input"]')
    input.value = 'https://example.com/recipe'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    qs<HTMLButtonElement>('[data-testid="import-submit-btn"]').click()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(qs('[data-testid="import-error"]').textContent).toContain(
      'Could not extract recipe from page',
    )
    expect(qs<HTMLInputElement>('[data-testid="import-url-input"]').disabled).toBe(false)
    wrapper.unmount()
  })

  it('disables image button and shows spinner while importing image', async () => {
    vi.mocked(importTasksApi.importRecipeFromImage).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-img-1', status: 'pending' }),
    )

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()

    const input = qs<HTMLInputElement>('[data-testid="import-image-input"]')
    const file = new File([new Uint8Array(32)], 'recipe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(qs<HTMLButtonElement>('[data-testid="import-image-btn"]').disabled).toBe(true)
    expect(document.body.querySelector('[data-testid="import-spinner"]')).toBeTruthy()
    wrapper.unmount()
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

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()

    const input = qs<HTMLInputElement>('[data-testid="import-image-input"]')
    const file = new File([new Uint8Array(32)], 'recipe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(mockPush).toHaveBeenCalledWith({
      name: 'recipe-edit',
      params: { id: 'recipe-img-99' },
      state: { importedRecipe: null },
    })
    wrapper.unmount()
  })

  it('emits close when the sheet backdrop is clicked', () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qs('.sheet-backdrop').click()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})
