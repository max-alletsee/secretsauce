// frontend/src/components/DayMealPicker.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DayMealPicker from './DayMealPicker.vue'

const baseProps = {
  fromDate: '2026-05-28',
  toDate: '2026-06-02',
  mealTypes: ['breakfast', 'lunch', 'dinner'],
  todayStr: '2026-05-29',
}

describe('DayMealPicker', () => {
  it('renders all in-range days', () => {
    const wrapper = mount(DayMealPicker, { props: baseProps })
    expect(wrapper.find('[data-testid="day-chip-2026-05-28"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-chip-2026-05-29"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-chip-2026-06-02"]').exists()).toBe(true)
  })

  it('past days are disabled', () => {
    const wrapper = mount(DayMealPicker, { props: baseProps })
    const past = wrapper.find('[data-testid="day-chip-2026-05-28"]')
    expect(past.attributes('disabled')).toBeDefined()
  })

  it('smart default selects first empty non-past slot', async () => {
    const wrapper = mount(DayMealPicker, { props: baseProps })
    await wrapper.find('[data-testid="picker-confirm"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-05-29', 'breakfast'])
  })

  it('smart default skips occupied slots', async () => {
    const wrapper = mount(DayMealPicker, {
      props: {
        ...baseProps,
        occupied: { '2026-05-29|breakfast': 1, '2026-05-29|lunch': 2 },
      },
    })
    await wrapper.find('[data-testid="picker-confirm"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-05-29', 'dinner'])
  })

  it('clicking day chip and meal type updates the selection', async () => {
    const wrapper = mount(DayMealPicker, { props: baseProps })
    await wrapper.find('[data-testid="day-chip-2026-06-01"]').trigger('click')
    await wrapper.find('[data-testid="meal-type-dinner"]').trigger('click')
    await wrapper.find('[data-testid="picker-confirm"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-06-01', 'dinner'])
  })

  it('cancel emits cancel', async () => {
    const wrapper = mount(DayMealPicker, { props: baseProps })
    await wrapper.find('[data-testid="picker-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('clicking a past day does not select it', async () => {
    const wrapper = mount(DayMealPicker, { props: baseProps })
    await wrapper.find('[data-testid="day-chip-2026-05-28"]').trigger('click')
    await wrapper.find('[data-testid="picker-confirm"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).not.toBe('2026-05-28')
  })

  it('shows occupied dot on day chip for selected meal type', async () => {
    const wrapper = mount(DayMealPicker, {
      props: {
        ...baseProps,
        occupied: { '2026-05-30|breakfast': 1 },
      },
    })
    // smart default selects breakfast (first meal type) on 2026-05-29 (today)
    expect(wrapper.find('[data-testid="day-chip-dot-2026-05-30"]').exists()).toBe(true)
  })

  it('initialDate / initialMealType override smart default', async () => {
    const wrapper = mount(DayMealPicker, {
      props: { ...baseProps, initialDate: '2026-06-02', initialMealType: 'lunch' },
    })
    await wrapper.find('[data-testid="picker-confirm"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-06-02', 'lunch'])
  })
})
