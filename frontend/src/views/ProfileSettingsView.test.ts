import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const updateProfile = vi.fn().mockResolvedValue(undefined)
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: () => ({
    user: {
      display_name: 'Sam',
      preferred_units: 'metric',
      default_servings: 2,
      meal_plan_system_prompt: '',
      meal_plan_meal_types: ['dinner'],
      meal_plan_days_ahead: 7,
      dietary_restrictions: ['vegan'],
      allergies: ['peanuts'],
      favorite_cuisines: ['italian'],
      disliked_ingredients: ['cilantro'],
    },
    updateProfile,
  }),
}))

import ProfileSettingsView from './ProfileSettingsView.vue'

describe('ProfileSettingsView food preferences', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    updateProfile.mockClear()
  })

  it('prefills the four preference fields as comma-separated strings', () => {
    const wrapper = mount(ProfileSettingsView)
    const dietary = wrapper.get('[data-testid="pref-dietary_restrictions"]')
      .element as HTMLInputElement
    expect(dietary.value).toBe('vegan')
    const allergies = wrapper.get('[data-testid="pref-allergies"]')
      .element as HTMLInputElement
    expect(allergies.value).toBe('peanuts')
  })

  it('serializes edited fields to trimmed string arrays on save', async () => {
    const wrapper = mount(ProfileSettingsView)
    await wrapper.get('[data-testid="pref-allergies"]')
      .setValue('peanuts, shellfish ,  ')
    await wrapper.get('[data-testid="pref-favorite_cuisines"]')
      .setValue('italian, thai')
    await wrapper.get('[data-testid="save-btn"]').trigger('click')
    await flushPromises()
    expect(updateProfile).toHaveBeenCalledTimes(1)
    const payload = updateProfile.mock.calls[0][0]
    expect(payload.allergies).toEqual(['peanuts', 'shellfish'])
    expect(payload.favorite_cuisines).toEqual(['italian', 'thai'])
    expect(payload.dietary_restrictions).toEqual(['vegan'])
    expect(payload.disliked_ingredients).toEqual(['cilantro'])
  })
})
