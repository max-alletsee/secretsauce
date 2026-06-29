// frontend/src/components/base/IconButton.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Plus } from '@lucide/vue'
import IconButton from './IconButton.vue'

describe('IconButton', () => {
  it('renders a <button> with aria-label equal to the label prop', () => {
    const wrapper = mount(IconButton, { props: { icon: Plus, label: 'Add item' } })
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-label')).toBe('Add item')
  })

  it('renders an svg icon inside the button', () => {
    const wrapper = mount(IconButton, { props: { icon: Plus, label: 'Add item' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('inner icon is decorative — svg has aria-hidden="true"', () => {
    const wrapper = mount(IconButton, { props: { icon: Plus, label: 'Add item' } })
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('disabled prop sets the disabled attribute on the button', () => {
    const wrapper = mount(IconButton, { props: { icon: Plus, label: 'Add item', disabled: true } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('applies ghost variant class by default', () => {
    const wrapper = mount(IconButton, { props: { icon: Plus, label: 'Add item' } })
    expect(wrapper.find('button').classes()).toContain('icon-btn--ghost')
  })

  it('applies the given variant class', () => {
    const wrapper = mount(IconButton, { props: { icon: Plus, label: 'Add item', variant: 'primary' } })
    expect(wrapper.find('button').classes()).toContain('icon-btn--primary')
  })

  it('renders button type="button"', () => {
    const wrapper = mount(IconButton, { props: { icon: Plus, label: 'Add item' } })
    expect(wrapper.find('button').attributes('type')).toBe('button')
  })
})
