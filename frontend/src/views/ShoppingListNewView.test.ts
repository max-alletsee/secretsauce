// frontend/src/views/ShoppingListNewView.test.ts
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimelineEntry } from '@/types/timeline'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/api/timeline', () => ({
  listEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

vi.mock('@/api/shoppingLists', () => ({
  generateShoppingList: vi.fn(),
  listShoppingLists: vi.fn(),
  getShoppingList: vi.fn(),
  deleteShoppingList: vi.fn(),
}))

const mockStartPolling = vi.fn()
vi.mock('@/composables/useImportPolling', () => ({
  useImportPolling: () => ({
    startPolling: mockStartPolling,
    status: { value: 'idle' },
    error: { value: null },
  }),
}))

import * as timelineApi from '@/api/timeline'
import * as shoppingApi from '@/api/shoppingLists'
import { useUserStore } from '@/stores/useUserStore'
import ShoppingListNewView from './ShoppingListNewView.vue'

const TODAY = '2026-07-13'

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'e1',
    user_id: 'u1',
    meal_plan_id: 'mp1',
    date: TODAY,
    meal_type: 'dinner',
    recipe_id: 'r1',
    note: 'Tacos',
    entry_type: 'recipe',
    servings: 2,
    source: 'manual',
    position: 0,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('ShoppingListNewView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${TODAY}T08:00:00Z`))

    const userStore = useUserStore()
    userStore.user = {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'Test',
      is_active: true,
      is_superuser: false,
      is_verified: true,
      dietary_restrictions: [],
      allergies: [],
      preferred_units: 'metric',
      favorite_cuisines: [],
      disliked_ingredients: [],
      default_servings: 2,
      meal_plan_system_prompt: null,
      meal_plan_meal_types: ['breakfast', 'dinner'],
      meal_plan_days_ahead: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
  })

  async function mountView(entries: TimelineEntry[]) {
    vi.mocked(timelineApi.listEntries).mockResolvedValue({ data: { entries } } as never)
    const wrapper = mount(ShoppingListNewView)
    await flushPromises()
    return wrapper
  }

  it('renders day sections grouped correctly from mocked timeline entries', async () => {
    const tomorrow = '2026-07-14'
    const entries = [
      makeEntry({ id: 'e1', date: TODAY, meal_type: 'dinner', note: 'Tacos' }),
      makeEntry({ id: 'e2', date: tomorrow, meal_type: 'breakfast', note: 'Oatmeal' }),
    ]
    const wrapper = await mountView(entries)

    const sections = wrapper.findAll('.day-section')
    expect(sections.length).toBe(2)
    expect(sections[0]!.text()).toContain(TODAY)
    expect(sections[0]!.text()).toContain('Tacos')
    expect(sections[1]!.text()).toContain(tomorrow)
    expect(sections[1]!.text()).toContain('Oatmeal')
  })

  it('clicking a meal chip toggles its entry in the selection, reflected in the summary count', async () => {
    const entries = [makeEntry({ id: 'e1', date: TODAY, meal_type: 'dinner', note: 'Tacos' })]
    const wrapper = await mountView(entries)

    // selectAllUpcoming() runs on mount, so it starts selected.
    expect(wrapper.text()).toContain('1 meals selected')

    const toggleChip = wrapper.find('.day-section button.toggle-chip')
    expect(toggleChip.exists()).toBe(true)
    expect(toggleChip.attributes('aria-pressed')).toBe('true')

    await toggleChip.trigger('click')
    expect(wrapper.text()).toContain('0 meals selected')
    expect(toggleChip.attributes('aria-pressed')).toBe('false')

    await toggleChip.trigger('click')
    expect(wrapper.text()).toContain('1 meals selected')
  })

  it('day-level select/clear toggles all of that day entries', async () => {
    const entries = [
      makeEntry({ id: 'e1', date: TODAY, meal_type: 'breakfast', note: 'Eggs' }),
      makeEntry({ id: 'e2', date: TODAY, meal_type: 'dinner', note: 'Tacos' }),
    ]
    const wrapper = await mountView(entries)

    // Both selected by default (selectAllUpcoming on mount).
    expect(wrapper.text()).toContain('2 meals selected')

    const dayToggle = wrapper.find('.day-toggle')
    expect(dayToggle.exists()).toBe(true)
    expect(dayToggle.text()).toBe('Clear day')

    await dayToggle.trigger('click')
    expect(wrapper.text()).toContain('0 meals selected')

    const dayToggleAfterClear = wrapper.find('.day-toggle')
    expect(dayToggleAfterClear.text()).toBe('Select day')

    await dayToggleAfterClear.trigger('click')
    expect(wrapper.text()).toContain('2 meals selected')
  })

  it('entries without recipe_id are not rendered as interactive chips', async () => {
    const entries = [
      makeEntry({ id: 'e1', date: TODAY, meal_type: 'dinner', recipe_id: null, note: null }),
    ]
    const wrapper = await mountView(entries)

    expect(wrapper.find('.toggle-chip').exists()).toBe(false)
    expect(wrapper.text()).toContain('No meals planned')
  })

  it('"Select all upcoming" and "Clear" still work at the page level', async () => {
    const entries = [
      makeEntry({ id: 'e1', date: TODAY, meal_type: 'breakfast', note: 'Eggs' }),
      makeEntry({ id: 'e2', date: TODAY, meal_type: 'dinner', note: 'Tacos' }),
    ]
    const wrapper = await mountView(entries)

    expect(wrapper.text()).toContain('2 meals selected')

    const buttons = wrapper.findAll('.toolbar-actions button')
    const clearBtn = buttons.find((b) => b.text() === 'Clear')!
    const selectAllBtn = buttons.find((b) => b.text() === 'Select all upcoming')!

    await clearBtn.trigger('click')
    expect(wrapper.text()).toContain('0 meals selected')

    await selectAllBtn.trigger('click')
    expect(wrapper.text()).toContain('2 meals selected')
  })

  it('shows a loading indicator while timeline entries are being fetched', async () => {
    let resolveEntries: (v: { data: { entries: TimelineEntry[] } }) => void = () => {}
    vi.mocked(timelineApi.listEntries).mockImplementation(
      () => new Promise((resolve) => { resolveEntries = resolve }) as never,
    )

    const wrapper = mount(ShoppingListNewView)
    await flushPromises()

    expect(wrapper.find('.loading-state').exists()).toBe(true)
    expect(wrapper.find('.day-section').exists()).toBe(false)

    resolveEntries({ data: { entries: [] } })
    await flushPromises()

    expect(wrapper.find('.loading-state').exists()).toBe(false)
  })

  it('disables the generate button when nothing is selected and enables it once something is', async () => {
    const entries = [makeEntry({ id: 'e1', date: TODAY, meal_type: 'dinner', note: 'Tacos' })]
    const wrapper = await mountView(entries)

    const generateBtn = wrapper.find('button.btn--primary')
    expect(generateBtn.attributes('disabled')).toBeUndefined()

    const clearBtn = wrapper.findAll('.toolbar-actions button').find((b) => b.text() === 'Clear')!
    await clearBtn.trigger('click')
    expect(wrapper.find('button.btn--primary').attributes('disabled')).toBeDefined()
  })

  it('calls generateShoppingList and starts polling on submit', async () => {
    const entries = [makeEntry({ id: 'e1', date: TODAY, meal_type: 'dinner', note: 'Tacos' })]
    vi.mocked(shoppingApi.generateShoppingList).mockResolvedValue({
      data: { task_id: 'task-1', status: 'pending' },
    } as never)

    const wrapper = await mountView(entries)
    await wrapper.find('button.btn--primary').trigger('click')
    await flushPromises()

    expect(shoppingApi.generateShoppingList).toHaveBeenCalledWith(['e1'], expect.any(String))
    expect(mockStartPolling).toHaveBeenCalledWith('task-1')
  })

  it('shows an inline error when starting generation fails', async () => {
    const entries = [makeEntry({ id: 'e1', date: TODAY, meal_type: 'dinner', note: 'Tacos' })]
    vi.mocked(shoppingApi.generateShoppingList).mockRejectedValue(new Error('boom'))

    const wrapper = await mountView(entries)
    await wrapper.find('button.btn--primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to start. Please try again.')
  })
})
