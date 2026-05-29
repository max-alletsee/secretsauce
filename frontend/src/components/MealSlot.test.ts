// frontend/src/components/MealSlot.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/timeline', () => ({
  listEntries: vi.fn().mockResolvedValue({ data: { entries: [] } }),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn().mockResolvedValue({ data: null }),
}))
vi.mock('@/api/mealPlans', () => ({
  getShortlist: vi.fn().mockResolvedValue({ data: [] }),
  addToShortlist: vi.fn(),
  removeFromShortlist: vi.fn().mockResolvedValue({ data: null }),
  reorderShortlist: vi.fn(),
}))
vi.mock('@/api/recipes', () => ({
  getRecipes: vi.fn().mockResolvedValue({ data: { items: [], next_cursor: null, has_more: false } }),
}))

import MealSlot from './MealSlot.vue'
import type { TimelineEntry } from '@/types/timeline'

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'e1',
    user_id: 'u1',
    meal_plan_id: null,
    date: '2026-05-29',
    meal_type: 'dinner',
    recipe_id: 'r1',
    note: null,
    entry_type: 'recipe',
    servings: 2,
    source: 'manual',
    position: 0,
    created_at: '2026-05-29T00:00:00Z',
    ...overrides,
  }
}

describe('MealSlot', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders recipe title from recipeTitles map', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [makeEntry()],
        date: '2026-05-29',
        mealType: 'dinner',
        recipeTitles: { r1: 'Pasta al Pesto' },
      },
    })
    expect(wrapper.text()).toContain('Pasta al Pesto')
  })

  it('renders freetext entry note', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [
          makeEntry({ id: 'e2', entry_type: 'freetext', recipe_id: null, note: 'Restaurant X' }),
        ],
        date: '2026-05-29',
        mealType: 'dinner',
        recipeTitles: {},
      },
    })
    expect(wrapper.text()).toContain('Restaurant X')
  })

  it('renders multiple entries (stacking)', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [
          makeEntry({ id: 'e1' }),
          makeEntry({ id: 'e2', recipe_id: 'r2' }),
        ],
        date: '2026-05-29',
        mealType: 'dinner',
        recipeTitles: { r1: 'A', r2: 'B' },
      },
    })
    expect(wrapper.findAll('[data-testid^="slot-entry-"]').length).toBe(2)
  })

  it('shows + Add control on empty slot', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [],
        date: '2026-05-29',
        mealType: 'dinner',
        recipeTitles: {},
      },
    })
    expect(wrapper.find('[data-testid="slot-add-2026-05-29-dinner"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('+ Add')
  })

  it('has no draggable attributes', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [makeEntry()],
        date: '2026-05-29',
        mealType: 'dinner',
        recipeTitles: { r1: 'Pasta' },
      },
    })
    expect(wrapper.findAll('[draggable="true"]').length).toBe(0)
  })

  it('hides Add button and entry menus when disabled', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [makeEntry()],
        date: '2026-05-25',
        mealType: 'dinner',
        recipeTitles: { r1: 'Pasta' },
        disabled: true,
      },
    })
    expect(wrapper.find('[data-testid="slot-add-2026-05-25-dinner"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="entry-menu-btn-e1"]').exists()).toBe(false)
  })

  it('opens entry actions menu when ⋮ clicked', async () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [makeEntry()],
        date: '2026-05-29',
        mealType: 'dinner',
        recipeTitles: { r1: 'Pasta' },
      },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="entry-menu-btn-e1"]').trigger('click')
    expect(wrapper.find('[data-testid="entry-actions-menu"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('emits open-recipe when recipe entry content clicked', async () => {
    const wrapper = mount(MealSlot, {
      props: {
        entries: [makeEntry()],
        date: '2026-05-29',
        mealType: 'dinner',
        recipeTitles: { r1: 'Pasta' },
      },
    })
    await wrapper.find('.entry-content').trigger('click')
    expect(wrapper.emitted('open-recipe')?.[0]).toEqual(['r1'])
  })
})
