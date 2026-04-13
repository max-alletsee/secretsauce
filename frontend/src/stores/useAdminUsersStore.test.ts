// frontend/src/stores/useAdminUsersStore.test.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from '@/api/admin'
import type { AdminUser } from '@/types/admin'

vi.mock('@/api/admin')

const mockUser = (overrides?: Partial<AdminUser>): AdminUser => ({
  id: '1', email: 'a@b.com', display_name: null,
  is_active: true, is_superuser: false, is_verified: true,
  preferred_units: 'metric', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useAdminUsersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchUsers populates users and pagination state', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    vi.mocked(adminApi.listUsers).mockResolvedValue({
      data: { items: [mockUser()], next_cursor: null, has_more: false },
    } as any)

    const store = useAdminUsersStore()
    await store.fetchUsers()

    expect(store.users).toHaveLength(1)
    expect(store.hasMore).toBe(false)
    expect(store.nextCursor).toBeNull()
  })

  it('expandUser sets expandedUserId and loads stats', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    vi.mocked(adminApi.getUserStats).mockResolvedValue({
      data: { recipe_count: 3, meal_plan_count: 1, last_active: null },
    } as any)

    const store = useAdminUsersStore()
    store.users = [mockUser({ id: 'u1' })]
    await store.expandUser('u1')

    expect(store.expandedUserId).toBe('u1')
    expect(store.userStats['u1']?.recipe_count).toBe(3)
  })

  it('expandUser collapses when called with already-expanded id', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    const store = useAdminUsersStore()
    store.expandedUserId = 'u1'
    await store.expandUser('u1')
    expect(store.expandedUserId).toBeNull()
  })

  it('updateUser patches user via API and updates local list', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    const updated = mockUser({ id: 'u1', is_active: false })
    vi.mocked(adminApi.updateUser).mockResolvedValue({ data: updated } as any)

    const store = useAdminUsersStore()
    store.users = [mockUser({ id: 'u1', is_active: true })]
    await store.updateUser('u1', { is_active: false })

    expect(store.users[0]!.is_active).toBe(false)
  })

  it('deleteUser removes user from local list', async () => {
    const { useAdminUsersStore } = await import('./useAdminUsersStore')
    vi.mocked(adminApi.deleteUser).mockResolvedValue({ data: undefined } as any)

    const store = useAdminUsersStore()
    store.users = [mockUser({ id: 'u1' }), mockUser({ id: 'u2' })]
    await store.deleteUser('u1')

    expect(store.users).toHaveLength(1)
    expect(store.users[0]!.id).toBe('u2')
  })
})
