// frontend/src/components/base/PourLoader.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PourLoader from './PourLoader.vue'

describe('PourLoader', () => {
  it('renders an element with role="status"', () => {
    const wrapper = mount(PourLoader)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('includes the default accessible label "Loading"', () => {
    const wrapper = mount(PourLoader)
    expect(wrapper.find('[role="status"]').text()).toContain('Loading')
  })

  it('uses a custom label when the label prop is provided', () => {
    const wrapper = mount(PourLoader, { props: { label: 'Saving recipe' } })
    expect(wrapper.find('[role="status"]').text()).toContain('Saving recipe')
  })

  it('renders the dot element for the animation', () => {
    const wrapper = mount(PourLoader)
    expect(wrapper.find('.pour-loader__dot').exists()).toBe(true)
  })
})
