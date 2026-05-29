// frontend/src/stores/useMealPlanStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

vi.mock('@/api/mealPlans', () => ({
  getMealPlans: vi.fn(),
  getMealPlan: vi.fn(),
  createMealPlan: vi.fn(),
  confirmMealPlan: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  requestSuggestions: vi.fn(),
}))

import * as mealPlansApi from '@/api/mealPlans'
import { useMealPlanStore } from './useMealPlanStore'
import type { MealPlan } from '@/types/mealPlan'

const mockPlan: MealPlan = {
  id: 'p1',
  user_id: 'u1',
  name: 'Week 1',
  start_date: '2026-04-07',
  end_date: '2026-04-13',
  status: 'draft',
  created_at: '2026-04-07T00:00:00Z',
  updated_at: '2026-04-07T00:00:00Z',
}

describe('useMealPlanStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts with empty state', () => {
    const store = useMealPlanStore()
    expect(store.plans).toEqual([])
    expect(store.currentPlan).toBeNull()
    expect(store.suggestions).toEqual([])
  })

  it('fetchPlans populates plans', async () => {
    vi.mocked(mealPlansApi.getMealPlans).mockResolvedValue(axiosOk([mockPlan]))
    const store = useMealPlanStore()
    await store.fetchPlans()
    expect(store.plans).toEqual([mockPlan])
  })

  it('confirmPlan calls confirmMealPlan API', async () => {
    vi.mocked(mealPlansApi.confirmMealPlan).mockResolvedValue(
      axiosOk({ ...mockPlan, status: 'active' } as MealPlan)
    )
    const store = useMealPlanStore()
    store.plans = [mockPlan]
    await store.confirmPlan('p1')
    expect(mealPlansApi.confirmMealPlan).toHaveBeenCalledWith('p1')
  })

  it('generateSuggestions sets suggestionLoading to true during call', async () => {
    vi.mocked(mealPlansApi.requestSuggestions).mockResolvedValue(
      axiosOk({ task_id: 't1', status: 'pending' })
    )
    const store = useMealPlanStore()
    const promise = store.generateSuggestions()
    expect(store.suggestionLoading).toBe(true)
    await promise
  })
})
