// frontend/src/stores/useUserStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  refreshToken: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  logout: vi.fn(),
}))

import * as authApi from '@/api/auth'
import { useUserStore } from './useUserStore'

const mockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  display_name: 'Test User',
  is_active: true,
  is_superuser: false,
  is_verified: false,
  dietary_restrictions: {},
  allergies: {},
  preferred_units: 'metric' as const,
  favorite_cuisines: [],
  disliked_ingredients: [],
  default_servings: 2,
  meal_plan_system_prompt: null,
  meal_plan_meal_types: ['dinner'],
  meal_plan_days_ahead: 7,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('starts unauthenticated with no user', () => {
    const store = useUserStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.isSuperuser).toBe(false)
  })

  it('login stores tokens in localStorage and loads user', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      data: { access_token: 'at123', refresh_token: 'rt456', token_type: 'bearer' },
    } as any)
    vi.mocked(authApi.getMe).mockResolvedValueOnce({ data: mockUser } as any)

    const store = useUserStore()
    await store.login({ email: 'test@example.com', password: 'pass' })

    expect(localStorage.getItem('access_token')).toBe('at123')
    expect(localStorage.getItem('refresh_token')).toBe('rt456')
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe('test@example.com')
  })

  it('logout clears state and localStorage', async () => {
    vi.mocked(authApi.logout).mockResolvedValueOnce({} as any)
    const store = useUserStore()
    localStorage.setItem('access_token', 'at123')
    localStorage.setItem('refresh_token', 'rt456')
    store.user = mockUser
    store.isAuthenticated = true

    await store.logout()

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })

  it('isSuperuser computed from user.is_superuser', () => {
    const store = useUserStore()
    store.user = { ...mockUser, is_superuser: true }
    expect(store.isSuperuser).toBe(true)
  })

  it('initFromStorage restores session if access token present', async () => {
    localStorage.setItem('access_token', 'at123')
    vi.mocked(authApi.getMe).mockResolvedValueOnce({ data: mockUser } as any)

    const store = useUserStore()
    await store.initFromStorage()

    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe('test@example.com')
  })

  it('initFromStorage clears state on API error', async () => {
    localStorage.setItem('access_token', 'expired_token')
    vi.mocked(authApi.getMe).mockRejectedValueOnce(new Error('401'))

    const store = useUserStore()
    await store.initFromStorage()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('refreshAccessToken returns true and updates tokens on success', async () => {
    localStorage.setItem('refresh_token', 'rt123')
    vi.mocked(authApi.refreshToken).mockResolvedValueOnce({
      data: { access_token: 'new_at', refresh_token: 'new_rt', token_type: 'bearer' },
    } as any)

    const store = useUserStore()
    const result = await store.refreshAccessToken()

    expect(result).toBe(true)
    expect(localStorage.getItem('access_token')).toBe('new_at')
    expect(localStorage.getItem('refresh_token')).toBe('new_rt')
  })

  it('refreshAccessToken returns false and clears tokens on failure', async () => {
    localStorage.setItem('refresh_token', 'bad_rt')
    vi.mocked(authApi.refreshToken).mockRejectedValueOnce(new Error('401'))

    const store = useUserStore()
    const result = await store.refreshAccessToken()

    expect(result).toBe(false)
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })
})
