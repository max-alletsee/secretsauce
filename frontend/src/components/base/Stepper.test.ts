// frontend/src/components/base/Stepper.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Stepper from './Stepper.vue'

describe('Stepper', () => {
  it('renders the current modelValue as text', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 4 } })
    expect(wrapper.text()).toContain('4')
  })

  it('emits update:modelValue with incremented value when plus button is clicked', async () => {
    const wrapper = mount(Stepper, { props: { modelValue: 3 } })
    await wrapper.find('[aria-label="Increase"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([4])
  })

  it('emits update:modelValue with decremented value when minus button is clicked', async () => {
    const wrapper = mount(Stepper, { props: { modelValue: 3 } })
    await wrapper.find('[aria-label="Decrease"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([2])
  })

  it('respects the step prop when incrementing', async () => {
    const wrapper = mount(Stepper, { props: { modelValue: 2, step: 3 } })
    await wrapper.find('[aria-label="Increase"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([5])
  })

  it('respects the step prop when decrementing', async () => {
    const wrapper = mount(Stepper, { props: { modelValue: 10, step: 2 } })
    await wrapper.find('[aria-label="Decrease"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([8])
  })

  it('defaults to step=1 when step prop is omitted', async () => {
    const wrapper = mount(Stepper, { props: { modelValue: 5 } })
    await wrapper.find('[aria-label="Increase"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([6])
  })

  it('clamps emitted value at max when incrementing beyond max', async () => {
    const wrapper = mount(Stepper, { props: { modelValue: 9, max: 10, step: 5 } })
    await wrapper.find('[aria-label="Increase"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([10])
  })

  it('clamps emitted value at min when decrementing below min', async () => {
    const wrapper = mount(Stepper, { props: { modelValue: 2, min: 1, step: 5 } })
    await wrapper.find('[aria-label="Decrease"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([1])
  })

  it('disables the minus button when modelValue equals min', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 1, min: 1 } })
    expect(wrapper.find('[aria-label="Decrease"]').attributes('disabled')).toBeDefined()
  })

  it('disables the plus button when modelValue equals max', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 10, max: 10 } })
    expect(wrapper.find('[aria-label="Increase"]').attributes('disabled')).toBeDefined()
  })

  it('does not disable minus when no min is defined', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 1 } })
    expect(wrapper.find('[aria-label="Decrease"]').attributes('disabled')).toBeUndefined()
  })

  it('does not disable plus when no max is defined', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 100 } })
    expect(wrapper.find('[aria-label="Increase"]').attributes('disabled')).toBeUndefined()
  })

  it('does not disable minus when modelValue is above min', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 5, min: 1 } })
    expect(wrapper.find('[aria-label="Decrease"]').attributes('disabled')).toBeUndefined()
  })

  it('does not disable plus when modelValue is below max', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 5, max: 10 } })
    expect(wrapper.find('[aria-label="Increase"]').attributes('disabled')).toBeUndefined()
  })

  it('never emits a value below min — minus is disabled at min bound', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 1, min: 1 } })
    expect(wrapper.find('[aria-label="Decrease"]').attributes('disabled')).toBeDefined()
  })

  it('never emits a value above max — plus is disabled at max bound', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 10, max: 10 } })
    expect(wrapper.find('[aria-label="Increase"]').attributes('disabled')).toBeDefined()
  })

  it('minus button has an accessible label', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 5 } })
    const minusLabel = wrapper.find('[aria-label="Decrease"]').attributes('aria-label')
    expect(minusLabel).toBeTruthy()
  })

  it('plus button has an accessible label', () => {
    const wrapper = mount(Stepper, { props: { modelValue: 5 } })
    const plusLabel = wrapper.find('[aria-label="Increase"]').attributes('aria-label')
    expect(plusLabel).toBeTruthy()
  })
})
