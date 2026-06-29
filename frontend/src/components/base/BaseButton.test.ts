// frontend/src/components/base/BaseButton.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseButton from './BaseButton.vue'

describe('BaseButton', () => {
  it('renders a <button type="button"> with class btn--primary by default', () => {
    const wrapper = mount(BaseButton)
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('type')).toBe('button')
    expect(btn.classes()).toContain('btn--primary')
  })

  it('applies btn--danger class when variant is "danger"', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'danger' } })
    expect(wrapper.find('button').classes()).toContain('btn--danger')
  })

  it('applies btn--secondary class when variant is "secondary"', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'secondary' } })
    expect(wrapper.find('button').classes()).toContain('btn--secondary')
  })

  it('applies btn--ghost class when variant is "ghost"', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'ghost' } })
    expect(wrapper.find('button').classes()).toContain('btn--ghost')
  })

  it('disabled prop sets the disabled attribute on the button', () => {
    const wrapper = mount(BaseButton, { props: { disabled: true } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('loading prop sets the disabled attribute on the button', () => {
    const wrapper = mount(BaseButton, { props: { loading: true } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('loading prop renders the loading indicator element', () => {
    const wrapper = mount(BaseButton, { props: { loading: true } })
    expect(wrapper.find('.btn__spinner').exists()).toBe(true)
  })

  it('loading prop does not show spinner when not loading', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.find('.btn__spinner').exists()).toBe(false)
  })

  it('renders slot content', () => {
    const wrapper = mount(BaseButton, {
      slots: { default: 'Click me' },
    })
    expect(wrapper.html()).toContain('Click me')
  })

  it('renders as submit button when type="submit"', () => {
    const wrapper = mount(BaseButton, { props: { type: 'submit' } })
    expect(wrapper.find('button').attributes('type')).toBe('submit')
  })
})
