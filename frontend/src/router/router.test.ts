// frontend/src/router/router.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Must mock BEFORE importing router (router imports useUserStore at module level)
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: vi.fn(() => ({
    isAuthenticated: false,
    isSuperuser: false,
    initFromStorage: vi.fn(),
  })),
}))

import { useUserStore } from '@/stores/useUserStore'
import router from './index'

describe('Router auth guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('redirects unauthenticated users from /recipes to /login', async () => {
    vi.mocked(useUserStore).mockReturnValue({
      isAuthenticated: false,
      isSuperuser: false,
      initFromStorage: vi.fn(),
    } as any)

    await router.push('/recipes')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('redirects authenticated users away from /login to /recipes', async () => {
    vi.mocked(useUserStore).mockReturnValue({
      isAuthenticated: true,
      isSuperuser: false,
      initFromStorage: vi.fn(),
    } as any)

    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('recipes')
  })

  it('redirects non-superuser away from /admin', async () => {
    vi.mocked(useUserStore).mockReturnValue({
      isAuthenticated: true,
      isSuperuser: false,
      initFromStorage: vi.fn(),
    } as any)

    await router.push('/admin')
    expect(router.currentRoute.value.name).toBe('recipes')
  })
})
