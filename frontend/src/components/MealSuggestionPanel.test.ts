// frontend/src/components/MealSuggestionPanel.test.ts
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

import MealSuggestionPanel from './MealSuggestionPanel.vue'
import type { MealSuggestion } from '@/types/mealPlan'

const mockSuggestions: MealSuggestion[] = [
  { title: 'Pasta al Pesto', matched_recipe_id: 'r1', entry_type: 'recipe' },
  { title: 'Thai curry', matched_recipe_id: null, entry_type: 'suggestion' },
]

describe('MealSuggestionPanel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders suggestion chips', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: mockSuggestions, loading: false },
    })
    expect(wrapper.text()).toContain('Pasta al Pesto')
    expect(wrapper.text()).toContain('Thai curry')
  })

  it('renders an AddToPlanButton on each chip', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: mockSuggestions, loading: false },
    })
    const addButtons = wrapper.findAll('[data-testid="add-to-plan-btn"]')
    expect(addButtons.length).toBe(mockSuggestions.length)
  })

  it('chips are not draggable', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: mockSuggestions, loading: false },
    })
    expect(wrapper.findAll('[draggable="true"]').length).toBe(0)
  })

  it('steer field is hidden by default', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    expect(wrapper.find('[data-testid="steer-input"]').exists()).toBe(false)
  })

  it('steer field appears when steer button clicked', async () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    await wrapper.find('[data-testid="steer-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="steer-input"]').exists()).toBe(true)
  })

  it('emits regenerate with steer prompt when Go clicked', async () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    await wrapper.find('[data-testid="steer-toggle"]').trigger('click')
    await wrapper.find('[data-testid="steer-input"]').setValue('cold dinner')
    await wrapper.find('[data-testid="steer-submit"]').trigger('click')
    expect(wrapper.emitted('regenerate')?.[0]).toEqual(['cold dinner'])
  })

  it('emits regenerate with no prompt when Regen clicked', async () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: false },
    })
    await wrapper.find('[data-testid="regen-btn"]').trigger('click')
    expect(wrapper.emitted('regenerate')?.[0]).toEqual([undefined])
  })

  it('shows loading state', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: [], loading: true },
    })
    expect(wrapper.find('[data-testid="suggestions-loading"]').exists()).toBe(true)
  })
})
