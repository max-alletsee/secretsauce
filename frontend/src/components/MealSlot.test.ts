// frontend/src/components/MealSlot.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MealSlot from './MealSlot.vue'
import type { TimelineEntry } from '@/types/timeline'

const mockEntry: TimelineEntry = {
  id: 'e1',
  user_id: 'u1',
  meal_plan_id: null,
  date: '2026-04-07',
  meal_type: 'dinner',
  recipe_id: 'r1',
  note: null,
  entry_type: 'recipe',
  servings: 2,
  source: 'manual',
  position: 0,
  created_at: '2026-04-07T00:00:00Z',
}

describe('MealSlot', () => {
  it('renders recipe title when entry type is recipe', () => {
    const wrapper = mount(MealSlot, {
      props: { entry: mockEntry, mealType: 'dinner', recipeTitle: 'Pasta al Pesto' },
    })
    expect(wrapper.text()).toContain('Pasta al Pesto')
  })

  it('renders note when entry_type is freetext', () => {
    const wrapper = mount(MealSlot, {
      props: {
        entry: { ...mockEntry, note: 'Restaurant X', entry_type: 'freetext', recipe_id: null },
        mealType: 'dinner',
      },
    })
    expect(wrapper.text()).toContain('Restaurant X')
  })

  it('shows empty placeholder when no entry', () => {
    const wrapper = mount(MealSlot, {
      props: { entry: null, mealType: 'dinner' },
    })
    expect(wrapper.find('[data-testid="slot-empty"]').exists()).toBe(true)
  })

  it('shows text input when empty slot clicked', async () => {
    const wrapper = mount(MealSlot, {
      props: { entry: null, mealType: 'dinner' },
    })
    await wrapper.find('[data-testid="slot-empty"]').trigger('click')
    expect(wrapper.find('[data-testid="slot-text-input"]').exists()).toBe(true)
  })

  it('emits save-text when input submitted', async () => {
    const wrapper = mount(MealSlot, {
      props: { entry: null, mealType: 'dinner' },
    })
    await wrapper.find('[data-testid="slot-empty"]').trigger('click')
    await wrapper.find('[data-testid="slot-text-input"]').setValue('Restaurant X')
    await wrapper.find('[data-testid="slot-text-input"]').trigger('keyup.enter')
    expect(wrapper.emitted('save-text')?.[0]).toEqual(['Restaurant X'])
  })

  it('does not start editing when disabled', async () => {
    const wrapper = mount(MealSlot, {
      props: { entry: null, mealType: 'dinner', disabled: true },
    })
    await wrapper.find('[data-testid="slot-empty"]').trigger('click')
    expect(wrapper.find('[data-testid="slot-text-input"]').exists()).toBe(false)
  })
})
