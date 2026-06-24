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
  RouterLink: { template: '<a><slot /></a>' },
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

  it('shows primary destinations including Shopping Lists and Settings', () => {
    const wrapper = mount(App)
    const text = wrapper.text()
    expect(text).toContain('Recipes')
    expect(text).toContain('Meal Plan')
    expect(text).toContain('Shopping Lists')
    expect(text).toContain('Settings')
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

  it('shows Admin link only for superusers', () => {
    superuser = true
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Admin')
  })
})
