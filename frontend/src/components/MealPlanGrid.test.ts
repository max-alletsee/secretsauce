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

import MealPlanGrid from './MealPlanGrid.vue'
import type { TimelineEntry } from '@/types/timeline'

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'e1',
    user_id: 'u1',
    meal_plan_id: null,
    date: '2026-06-21',
    meal_type: 'dinner',
    recipe_id: 'r1',
    note: null,
    entry_type: 'recipe',
    servings: 2,
    source: 'manual',
    position: 0,
    created_at: '2026-06-21T00:00:00Z',
    ...overrides,
  }
}

describe('MealPlanGrid past days', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders past-day slots as editable (add control present) but grey', () => {
    const wrapper = mount(MealPlanGrid, {
      props: {
        fromDate: '2026-06-21',
        toDate: '2026-06-21',
        mealTypes: ['dinner'],
        entries: [],
        recipeTitles: {},
        todayStr: '2026-06-23',
      },
    })
    // Past row is visually marked
    expect(wrapper.find('.day-row--past').exists()).toBe(true)
    // ...but its add control is still rendered (editable)
    expect(
      wrapper.find('[data-testid="slot-add-2026-06-21-dinner"]').exists(),
    ).toBe(true)
  })

  // Regression test: past days must remain fully interactive (viewable + loggable).
  // The `disabled` prop passed to MealSlot must stay false for past days — only the
  // CSS grey treatment (day-row--past) should change, never functionality. This pins
  // down what was previously an implicit/accidental invariant (a hardcoded
  // `:disabled="false"` in the template) so a future refactor can't silently flip it.
  it('does not mark past-day meal slots as disabled', () => {
    const wrapper = mount(MealPlanGrid, {
      props: {
        fromDate: '2026-06-21',
        toDate: '2026-06-21',
        mealTypes: ['dinner'],
        entries: [makeEntry()],
        recipeTitles: { r1: 'Pasta al Pesto' },
        todayStr: '2026-06-23',
      },
    })
    const slot = wrapper.find('[data-testid="meal-slot-2026-06-21-dinner"]')
    expect(slot.exists()).toBe(true)
    // The real "disabled" visual/behavioral state is a distinct CSS class from
    // day-row--past greying — past days must never acquire it.
    expect(slot.classes()).not.toContain('meal-slot--disabled')
    // Entry menu (⋮) must still be present and usable on past entries.
    expect(wrapper.find('[data-testid="entry-menu-btn-e1"]').exists()).toBe(true)
    // The + add control must still be present on past slots.
    expect(
      wrapper.find('[data-testid="slot-add-2026-06-21-dinner"]').exists(),
    ).toBe(true)
  })

  it('still emits open-recipe when a recipe entry in a past day is clicked', async () => {
    const wrapper = mount(MealPlanGrid, {
      props: {
        fromDate: '2026-06-21',
        toDate: '2026-06-21',
        mealTypes: ['dinner'],
        entries: [makeEntry()],
        recipeTitles: { r1: 'Pasta al Pesto' },
        todayStr: '2026-06-23',
      },
    })
    await wrapper.find('.entry-content').trigger('click')
    expect(wrapper.emitted('open-recipe')?.[0]).toEqual(['r1'])
  })
})

describe('MealPlanGrid vertical day sections', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders one day section per day in range, each grouping its own meal slots', () => {
    const wrapper = mount(MealPlanGrid, {
      props: {
        fromDate: '2026-06-21',
        toDate: '2026-06-22',
        mealTypes: ['breakfast', 'dinner'],
        entries: [],
        recipeTitles: {},
        todayStr: '2026-06-21',
      },
    })
    const sections = wrapper.findAll('section.day-row')
    expect(sections.length).toBe(2)
    // Each day section contains its own meal slots (scoped, not a shared row)
    expect(
      sections[0]!.find('[data-testid="meal-slot-2026-06-21-breakfast"]').exists(),
    ).toBe(true)
    expect(
      sections[0]!.find('[data-testid="meal-slot-2026-06-21-dinner"]').exists(),
    ).toBe(true)
    expect(
      sections[1]!.find('[data-testid="meal-slot-2026-06-22-breakfast"]').exists(),
    ).toBe(true)
  })
})
