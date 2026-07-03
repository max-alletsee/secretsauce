// frontend/src/components/base/UserMenu.test.ts
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import UserMenu from './UserMenu.vue'

// RouterLink stub that passes `to` through so we can assert routing items
const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

describe('UserMenu', () => {
  const items = [
    { label: 'Settings', to: '/settings' },
    { label: 'Log out', onClick: vi.fn() },
  ]

  it('renders the account trigger button', () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    // The trigger should be a button (IconButton renders a <button>)
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('menu is closed by default (aria-expanded="false")', () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const trigger = wrapper.find('button[aria-haspopup="menu"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('trigger has aria-haspopup="menu"', () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const trigger = wrapper.find('button[aria-haspopup="menu"]')
    expect(trigger.exists()).toBe(true)
  })

  it('opens the menu when the trigger is clicked', async () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const trigger = wrapper.find('button[aria-haspopup="menu"]')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
  })

  it('closes the menu when the trigger is clicked a second time', async () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const trigger = wrapper.find('button[aria-haspopup="menu"]')
    await trigger.trigger('click')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('shows menu items when open', async () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.text()).toContain('Log out')
  })

  it('renders navigation items with a link', async () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    // Settings item has `to`, so it should render as a link
    const link = wrapper.find('a[href="/settings"]')
    expect(link.exists()).toBe(true)
  })

  it('calls onClick and closes the menu when a menu item is clicked', async () => {
    const onClick = vi.fn()
    const wrapper = mount(UserMenu, {
      props: { items: [{ label: 'Log out', onClick }] },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')

    // Find menuitem by role
    const menuItem = wrapper.find('[role="menuitem"]')
    await menuItem.trigger('click')

    expect(onClick).toHaveBeenCalledOnce()
    // Menu should be closed after clicking
    await nextTick()
    expect(wrapper.find('button[aria-haspopup="menu"]').attributes('aria-expanded')).toBe('false')
  })

  it('closes the menu when Escape is pressed', async () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
      attachTo: document.body,
    })
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    expect(wrapper.find('button[aria-haspopup="menu"]').attributes('aria-expanded')).toBe('true')

    await wrapper.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('button[aria-haspopup="menu"]').attributes('aria-expanded')).toBe('false')

    wrapper.unmount()
  })

  it('menu list has role="menu"', async () => {
    const wrapper = mount(UserMenu, {
      props: { items },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
  })
})
