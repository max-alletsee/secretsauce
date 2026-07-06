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
