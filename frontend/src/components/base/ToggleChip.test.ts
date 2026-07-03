// frontend/src/components/base/ToggleChip.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToggleChip from './ToggleChip.vue'

describe('ToggleChip', () => {
  it('renders a <button> element', () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: false } })
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('sets aria-pressed="false" when modelValue is false', () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: false } })
    expect(wrapper.find('button').attributes('aria-pressed')).toBe('false')
  })

  it('sets aria-pressed="true" when modelValue is true', () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: true } })
    expect(wrapper.find('button').attributes('aria-pressed')).toBe('true')
  })

  it('emits update:modelValue with true when clicked in off state', async () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: false } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([true])
  })

  it('emits update:modelValue with false when clicked in on state', async () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: true } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('renders label prop as text content', () => {
    const wrapper = mount(ToggleChip, {
      props: { modelValue: false, label: 'Vegan' },
    })
    expect(wrapper.text()).toContain('Vegan')
  })

  it('applies chip--active class when modelValue is true', () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: true } })
    expect(wrapper.find('button').classes()).toContain('chip--active')
  })

  it('does not apply chip--active class when modelValue is false', () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: false } })
    expect(wrapper.find('button').classes()).not.toContain('chip--active')
  })

  it('has type="button" to avoid accidental form submission', () => {
    const wrapper = mount(ToggleChip, { props: { modelValue: false } })
    expect(wrapper.find('button').attributes('type')).toBe('button')
  })
})
