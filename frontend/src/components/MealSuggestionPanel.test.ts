// frontend/src/components/MealSuggestionPanel.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MealSuggestionPanel from './MealSuggestionPanel.vue'
import type { MealSuggestion } from '@/types/mealPlan'

const mockSuggestions: MealSuggestion[] = [
  { title: 'Pasta al Pesto', matched_recipe_id: 'r1', entry_type: 'recipe' },
  { title: 'Thai curry', matched_recipe_id: null, entry_type: 'suggestion' },
]

describe('MealSuggestionPanel', () => {
  it('renders suggestion chips', () => {
    const wrapper = mount(MealSuggestionPanel, {
      props: { suggestions: mockSuggestions, loading: false },
    })
    expect(wrapper.text()).toContain('Pasta al Pesto')
    expect(wrapper.text()).toContain('Thai curry')
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
