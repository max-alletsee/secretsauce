// frontend/src/stores/useShortlistStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

vi.mock('@/api/mealPlans', () => ({
  getShortlist: vi.fn(),
  addToShortlist: vi.fn(),
  removeFromShortlist: vi.fn(),
  reorderShortlist: vi.fn(),
}))

import * as mealPlansApi from '@/api/mealPlans'
import { useShortlistStore } from './useShortlistStore'
import type { ShortlistEntry } from '@/types/mealPlan'

const mockEntry: ShortlistEntry = {
  id: 's1',
  user_id: 'u1',
  recipe_id: null,
  note: 'Shakshuka',
  entry_type: 'suggestion',
  position: 0,
  created_at: '2026-04-07T00:00:00Z',
}

describe('useShortlistStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchShortlist populates entries', async () => {
    vi.mocked(mealPlansApi.getShortlist).mockResolvedValue(axiosOk([mockEntry]))
    const store = useShortlistStore()
    await store.fetchShortlist()
    expect(store.entries).toEqual([mockEntry])
  })

  it('addEntry appends to entries', async () => {
    vi.mocked(mealPlansApi.addToShortlist).mockResolvedValue(axiosOk(mockEntry))
    const store = useShortlistStore()
    await store.addEntry({ note: 'Shakshuka', entry_type: 'suggestion' })
    expect(store.entries).toHaveLength(1)
  })

  it('removeEntry removes from entries', async () => {
    vi.mocked(mealPlansApi.removeFromShortlist).mockResolvedValue(axiosOk(undefined))
    const store = useShortlistStore()
    store.entries = [mockEntry]
    await store.removeEntry('s1')
    expect(store.entries).toHaveLength(0)
  })

  it('reorder calls API with ordered IDs', async () => {
    vi.mocked(mealPlansApi.reorderShortlist).mockResolvedValue(axiosOk([mockEntry]))
    const store = useShortlistStore()
    await store.reorder(['s1'])
    expect(mealPlansApi.reorderShortlist).toHaveBeenCalledWith(['s1'])
  })
})
