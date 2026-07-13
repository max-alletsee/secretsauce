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

/** Find the ToggleChip <button> with exact visible text `label` inside `container`. */
function findChip(container: ReturnType<typeof mount>['element'] | Element, label: string) {
  const buttons = Array.from((container as Element).querySelectorAll('button'))
  const match = buttons.find((b) => b.textContent?.trim() === label)
  if (!match) throw new Error(`No chip found with label "${label}"`)
  return match
}

describe('ProfileSettingsView food preferences', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    updateProfile.mockClear()
  })

  it('prefills dietary_restrictions and favorite_cuisines chips as pressed, and tag-inputs with existing tags', () => {
    const wrapper = mount(ProfileSettingsView)

    const dietaryGroup = wrapper.get('[data-testid="pref-dietary_restrictions"]').element
    const veganChip = findChip(dietaryGroup, 'vegan')
    expect(veganChip.getAttribute('aria-pressed')).toBe('true')
    const glutenFreeChip = findChip(dietaryGroup, 'gluten-free')
    expect(glutenFreeChip.getAttribute('aria-pressed')).toBe('false')

    const cuisineGroup = wrapper.get('[data-testid="pref-favorite_cuisines"]').element
    const italianChip = findChip(cuisineGroup, 'italian')
    expect(italianChip.getAttribute('aria-pressed')).toBe('true')

    // allergies / disliked_ingredients are free-text tag inputs, prefilled as chips
    const allergiesWrapper = wrapper.get('[data-testid="pref-allergies"]')
    expect(allergiesWrapper.text()).toContain('peanuts')
    const dislikedWrapper = wrapper.get('[data-testid="pref-disliked_ingredients"]')
    expect(dislikedWrapper.text()).toContain('cilantro')
  })

  it('serializes chip clicks and typed tags to trimmed string arrays on save', async () => {
    const wrapper = mount(ProfileSettingsView)

    // Toggle a preset dietary-restriction chip on (real click, not text input)
    const dietaryGroup = wrapper.get('[data-testid="pref-dietary_restrictions"]').element
    await findChip(dietaryGroup, 'gluten-free').dispatchEvent(new Event('click'))

    // Toggle a preset favorite-cuisine chip on
    const cuisineGroup = wrapper.get('[data-testid="pref-favorite_cuisines"]').element
    await findChip(cuisineGroup, 'thai').dispatchEvent(new Event('click'))

    // Type-and-commit a new allergy via the free-text tag input
    const allergiesInput = wrapper.get('[data-testid="pref-allergies"] input')
    await allergiesInput.setValue('shellfish')
    await allergiesInput.trigger('keydown', { key: 'Enter' })

    // Type-and-commit a new disliked ingredient, including accidental whitespace
    const dislikedInput = wrapper.get('[data-testid="pref-disliked_ingredients"] input')
    await dislikedInput.setValue('  olives  ')
    await dislikedInput.trigger('keydown', { key: 'Enter' })

    await wrapper.get('[data-testid="save-btn"]').trigger('click')
    await flushPromises()

    expect(updateProfile).toHaveBeenCalledTimes(1)
    const payload = updateProfile.mock.calls[0]![0]
    expect(payload.dietary_restrictions).toEqual(['vegan', 'gluten-free'])
    expect(payload.favorite_cuisines).toEqual(['italian', 'thai'])
    expect(payload.allergies).toEqual(['peanuts', 'shellfish'])
    expect(payload.disliked_ingredients).toEqual(['cilantro', 'olives'])
  })

  it('does not offer season/meal-type/cuisine tags under dietary_restrictions', () => {
    const wrapper = mount(ProfileSettingsView)
    const dietaryGroup = wrapper.get('[data-testid="pref-dietary_restrictions"]').element as Element
    const labels = Array.from(dietaryGroup.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(labels).not.toContain('summer')
    expect(labels).not.toContain('breakfast')
    expect(labels).not.toContain('thai')
  })

  it('removes a chip-based tag by clicking it again (toggle off)', async () => {
    const wrapper = mount(ProfileSettingsView)
    const dietaryGroup = wrapper.get('[data-testid="pref-dietary_restrictions"]').element
    const veganChip = findChip(dietaryGroup, 'vegan')
    expect(veganChip.getAttribute('aria-pressed')).toBe('true')
    await veganChip.dispatchEvent(new Event('click'))

    await wrapper.get('[data-testid="save-btn"]').trigger('click')
    await flushPromises()
    const payload = updateProfile.mock.calls[0]![0]
    expect(payload.dietary_restrictions).toEqual([])
  })

  it('removes a free-text tag via its remove button', async () => {
    const wrapper = mount(ProfileSettingsView)
    const allergiesWrapper = wrapper.get('[data-testid="pref-allergies"]')
    const removeBtn = allergiesWrapper
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Remove peanuts')
    expect(removeBtn).toBeTruthy()
    await removeBtn!.trigger('click')

    await wrapper.get('[data-testid="save-btn"]').trigger('click')
    await flushPromises()
    const payload = updateProfile.mock.calls[0]![0]
    expect(payload.allergies).toEqual([])
  })
})
