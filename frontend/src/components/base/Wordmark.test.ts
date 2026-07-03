// frontend/src/components/base/Wordmark.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Wordmark from './Wordmark.vue'

describe('Wordmark', () => {
  it('renders the wordmark text "secretsauce" by default', () => {
    const wrapper = mount(Wordmark)
    expect(wrapper.find('.wordmark__text').exists()).toBe(true)
    expect(wrapper.find('.wordmark__text').text()).toBe('secretsauce')
  })

  it('always renders the dot', () => {
    const wrapper = mount(Wordmark)
    expect(wrapper.find('.wordmark__dot').exists()).toBe(true)
  })

  it('hides the text when dotOnly is true', () => {
    const wrapper = mount(Wordmark, { props: { dotOnly: true } })
    expect(wrapper.find('.wordmark__text').exists()).toBe(false)
  })

  it('still renders the dot when dotOnly is true', () => {
    const wrapper = mount(Wordmark, { props: { dotOnly: true } })
    expect(wrapper.find('.wordmark__dot').exists()).toBe(true)
  })
})
