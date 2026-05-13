import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimelineStore } from './useTimelineStore'

vi.mock('@/api/timeline', () => ({
  listEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

import * as timelineApi from '@/api/timeline'

function makeEntry(id: string, date = '2026-06-10', mealType = 'dinner') {
  return {
    id,
    user_id: 'u1',
    meal_plan_id: null,
    date,
    meal_type: mealType,
    recipe_id: null,
    note: 'test',
    entry_type: 'freetext' as const,
    servings: 2,
    source: 'manual' as const,
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('useTimelineStore.appendEntries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('appends new entries without duplicates', async () => {
    const store = useTimelineStore()
    const existing = makeEntry('e1', '2026-06-10')
    store.entries = [existing]

    const fetched = [makeEntry('e1', '2026-06-10'), makeEntry('e2', '2026-06-17')]
    vi.mocked(timelineApi.listEntries).mockResolvedValueOnce({
      data: { entries: fetched },
    } as never)

    await store.appendEntries('2026-06-10', '2026-06-17')

    expect(store.entries).toHaveLength(2)
    expect(store.entries.map((e) => e.id)).toEqual(['e1', 'e2'])
  })
})
