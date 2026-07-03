// frontend/src/components/base/TabBar.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { markRaw } from 'vue'
import TabBar from './TabBar.vue'

// A minimal icon stub — just needs to satisfy the Component type
const FakeIcon = markRaw({ template: '<svg />' })
const FakeIcon2 = markRaw({ template: '<svg />' })
const FakeIcon3 = markRaw({ template: '<svg />' })

const items = [
  { to: '/recipes', label: 'Recipes', icon: FakeIcon },
  { to: '/meal-plan', label: 'Meal Plan', icon: FakeIcon2 },
  { to: '/shopping-lists', label: 'Shopping Lists', icon: FakeIcon3 },
]

// Use a RouterLink stub that exposes the `to` prop as an href so we can assert routes
const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

describe('TabBar', () => {
  it('renders a <nav> element', () => {
    const wrapper = mount(TabBar, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('nav').exists()).toBe(true)
  })

  it('renders one link per item', () => {
    const wrapper = mount(TabBar, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(items.length)
  })

  it('renders each item label', () => {
    const wrapper = mount(TabBar, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    for (const item of items) {
      expect(wrapper.text()).toContain(item.label)
    }
  })

  it('each link href matches the item `to` route', () => {
    const wrapper = mount(TabBar, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const links = wrapper.findAll('a')
    links.forEach((link, i) => {
      expect(link.attributes('href')).toBe(items[i]!.to)
    })
  })

  it('renders with an empty items array without crashing', () => {
    const wrapper = mount(TabBar, {
      props: { items: [] },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('nav').exists()).toBe(true)
    expect(wrapper.findAll('a')).toHaveLength(0)
  })
})
