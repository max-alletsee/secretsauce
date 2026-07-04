import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const logout = vi.fn().mockResolvedValue(undefined)
let authed = true
let superuser = false
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: () => ({
    get isAuthenticated() { return authed },
    get isSuperuser() { return superuser },
    logout,
  }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  RouterView: { template: '<div />' },
}))

import App from './App.vue'

describe('App nav', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    authed = true
    superuser = false
    logout.mockClear()
  })

  it('shows primary destinations on the desktop top bar', () => {
    const wrapper = mount(App)
    const text = wrapper.text()
    expect(text).toContain('Recipes')
    expect(text).toContain('Meal Plan')
    expect(text).toContain('Shopping Lists')
  })

  it('renders a mobile bottom tab bar', () => {
    const wrapper = mount(App)
    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(true)
  })

  it('hides nav when unauthenticated', () => {
    authed = false
    const wrapper = mount(App)
    expect(wrapper.find('[data-testid="bottom-nav"]').exists()).toBe(false)
    expect(wrapper.find('.app-nav').exists()).toBe(false)
  })

  it('does not show Settings/Admin/Log out in the top bar until the account menu is opened', () => {
    superuser = true
    const wrapper = mount(App)
    const topBarText = wrapper.find('.app-nav').text()
    expect(topBarText).not.toContain('Settings')
    expect(topBarText).not.toContain('Admin')
    expect(topBarText).not.toContain('Log out')
  })

  it('shows Settings inside the account menu when opened', async () => {
    const wrapper = mount(App)
    await wrapper.find('button[aria-label="Account"]').trigger('click')
    expect(wrapper.text()).toContain('Settings')
  })

  it('shows Admin link inside the account menu only for superusers', async () => {
    superuser = true
    const wrapper = mount(App)
    await wrapper.find('button[aria-label="Account"]').trigger('click')
    expect(wrapper.text()).toContain('Admin')
  })

  it('does not show Admin link inside the account menu for non-superusers', async () => {
    superuser = false
    const wrapper = mount(App)
    await wrapper.find('button[aria-label="Account"]').trigger('click')
    const menuText = wrapper.find('[role="menu"]').text()
    expect(menuText).not.toContain('Admin')
  })

  it('logs out via the account menu', async () => {
    const wrapper = mount(App)
    await wrapper.find('button[aria-label="Account"]').trigger('click')
    const logoutBtn = wrapper.find('[data-testid="logout"]')
    expect(logoutBtn.exists()).toBe(true)
    await logoutBtn.trigger('click')
    expect(logout).toHaveBeenCalledOnce()
  })
})
