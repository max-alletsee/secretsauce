// frontend/src/stores/useAdminLogsStore.test.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from '@/api/admin'

vi.mock('@/api/admin')

describe('useAdminLogsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchAppLogs populates appLogs', async () => {
    const { useAdminLogsStore } = await import('./useAdminLogsStore')
    vi.mocked(adminApi.getAppLogs).mockResolvedValue({
      data: { items: [{ timestamp: 't', level: 'INFO', method: 'GET', path: '/x', status_code: 200, latency_ms: 1, user_id: null }] },
    } as any)
    const store = useAdminLogsStore()
    await store.fetchAppLogs()
    expect(store.appLogs).toHaveLength(1)
  })

  it('fetchAiLogs populates aiLogs', async () => {
    const { useAdminLogsStore } = await import('./useAdminLogsStore')
    vi.mocked(adminApi.getAiLogs).mockResolvedValue({
      data: { items: [], next_cursor: null, has_more: false },
    } as any)
    const store = useAdminLogsStore()
    await store.fetchAiLogs()
    expect(store.aiLogs).toEqual([])
    expect(store.aiLogsHasMore).toBe(false)
  })

  it('fetchAuditLogs populates auditLogs', async () => {
    const { useAdminLogsStore } = await import('./useAdminLogsStore')
    vi.mocked(adminApi.getAuditLogs).mockResolvedValue({
      data: { items: [], next_cursor: null, has_more: false },
    } as any)
    const store = useAdminLogsStore()
    await store.fetchAuditLogs()
    expect(store.auditLogs).toEqual([])
  })
})
