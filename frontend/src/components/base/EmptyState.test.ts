// frontend/src/components/base/EmptyState.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders the title prop', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No recipes yet' },
    })
    expect(wrapper.text()).toContain('No recipes yet')
  })

  it('renders the body prop when provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No recipes yet', body: 'Import your first recipe to get started.' },
    })
    expect(wrapper.text()).toContain('Import your first recipe to get started.')
  })

  it('does not render body element when body prop is omitted', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No recipes yet' },
    })
    expect(wrapper.find('.empty-state__body').exists()).toBe(false)
  })

  it('renders content in the illustration slot', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Nothing here' },
      slots: {
        illustration: '<svg data-testid="icon" />',
      },
    })
    expect(wrapper.find('[data-testid="icon"]').exists()).toBe(true)
  })

  it('renders content in the action slot', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Nothing here' },
      slots: {
        action: '<button>Add recipe</button>',
      },
    })
    expect(wrapper.find('button').text()).toBe('Add recipe')
  })

  it('renders body text from default slot when body prop is omitted', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Nothing here' },
      slots: {
        default: 'Slot body text here',
      },
    })
    expect(wrapper.text()).toContain('Slot body text here')
  })

  it('has centered layout via empty-state class', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No recipes yet' },
    })
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })
})
