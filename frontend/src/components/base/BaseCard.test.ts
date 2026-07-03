// frontend/src/components/base/BaseCard.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseCard from './BaseCard.vue'

describe('BaseCard', () => {
  it('renders the default slot content', () => {
    const wrapper = mount(BaseCard, {
      slots: { default: '<p>Recipe title</p>' },
    })
    expect(wrapper.html()).toContain('Recipe title')
  })

  it('has the card CSS class', () => {
    const wrapper = mount(BaseCard)
    expect(wrapper.classes()).toContain('card')
  })

  it('renders as a div by default', () => {
    const wrapper = mount(BaseCard)
    expect(wrapper.element.tagName).toBe('DIV')
  })

  it('renders an empty card without errors when no slot is provided', () => {
    const wrapper = mount(BaseCard)
    expect(wrapper.exists()).toBe(true)
  })
})
