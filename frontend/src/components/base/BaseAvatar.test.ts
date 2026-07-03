// frontend/src/components/base/BaseAvatar.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseAvatar from './BaseAvatar.vue'

describe('BaseAvatar', () => {
  it('shows initials when a single-word name is provided', () => {
    const wrapper = mount(BaseAvatar, { props: { name: 'Alice' } })
    expect(wrapper.text()).toContain('A')
  })

  it('shows two initials for a two-word name', () => {
    const wrapper = mount(BaseAvatar, { props: { name: 'Jane Doe' } })
    expect(wrapper.text()).toContain('JD')
  })

  it('shows only two initials for a name with more than two words', () => {
    const wrapper = mount(BaseAvatar, { props: { name: 'Mary Anne Smith' } })
    // Only first two words' initials
    expect(wrapper.text()).toContain('MA')
    expect(wrapper.text()).not.toContain('S')
  })

  it('uppercases initials', () => {
    const wrapper = mount(BaseAvatar, { props: { name: 'bob smith' } })
    expect(wrapper.text()).toContain('BS')
  })

  it('renders the CircleUser icon fallback when name is not provided', () => {
    const wrapper = mount(BaseAvatar)
    // No text initials — the icon fallback should be present
    const text = wrapper.text().trim()
    expect(text).toBe('')
    // The icon wrapper element should exist (BaseIcon renders the SVG component)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders the CircleUser icon fallback when name is an empty string', () => {
    const wrapper = mount(BaseAvatar, { props: { name: '' } })
    const text = wrapper.text().trim()
    expect(text).toBe('')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('has the avatar root class', () => {
    const wrapper = mount(BaseAvatar, { props: { name: 'Alice' } })
    expect(wrapper.find('.avatar').exists()).toBe(true)
  })
})
