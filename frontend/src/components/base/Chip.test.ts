// frontend/src/components/base/Chip.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Chip from './Chip.vue'

describe('Chip', () => {
  it('renders slot content', () => {
    const wrapper = mount(Chip, { slots: { default: 'Vegetarian' } })
    expect(wrapper.text()).toContain('Vegetarian')
  })

  it('applies chip--accent class when tone is "accent"', () => {
    const wrapper = mount(Chip, { props: { tone: 'accent' } })
    expect(wrapper.find('.chip').classes()).toContain('chip--accent')
  })

  it('applies chip--neutral class when tone is "neutral"', () => {
    const wrapper = mount(Chip, { props: { tone: 'neutral' } })
    expect(wrapper.find('.chip').classes()).toContain('chip--neutral')
  })

  it('defaults to accent tone when no tone prop is provided', () => {
    const wrapper = mount(Chip)
    expect(wrapper.find('.chip').classes()).toContain('chip--accent')
  })

  it('is not a button element — it is a static display element', () => {
    const wrapper = mount(Chip)
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
