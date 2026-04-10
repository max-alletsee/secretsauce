// frontend/src/stores/useShoppingListStore.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

vi.mock('@/api/shoppingLists', () => ({
  getShoppingList: vi.fn(),
  regenerateShoppingList: vi.fn(),
  toggleItem: vi.fn(),
}))

import * as shoppingApi from '@/api/shoppingLists'
import { useShoppingListStore } from './useShoppingListStore'
import type { ShoppingList, ShoppingListItem } from '@/types/shoppingList'

const mockItem: ShoppingListItem = {
  id: 'i1',
  shopping_list_id: 'sl1',
  ingredient_name: 'flour',
  total_quantity: 200,
  unit: 'g',
  detail: '200 g for Pizza Dough',
  category: 'Basic Ingredients for Cooking and Baking',
  recipe_ids: ['r1'],
  checked: false,
  created_at: '2026-04-09T00:00:00Z',
}

const mockList: ShoppingList = {
  id: 'sl1',
  user_id: 'u1',
  meal_plan_id: 'mp1',
  name: 'Week Plan',
  items: [mockItem],
  created_at: '2026-04-09T00:00:00Z',
  updated_at: '2026-04-09T00:00:00Z',
}

describe('useShoppingListStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchList populates list', async () => {
    vi.mocked(shoppingApi.getShoppingList).mockResolvedValue(axiosOk(mockList))
    const store = useShoppingListStore()
    await store.fetchList('mp1')
    expect(store.list).toEqual(mockList)
  })

  it('fetchList sets and clears loading', async () => {
    vi.mocked(shoppingApi.getShoppingList).mockResolvedValue(axiosOk(mockList))
    const store = useShoppingListStore()
    const promise = store.fetchList('mp1')
    expect(store.loading).toBe(true)
    await promise
    expect(store.loading).toBe(false)
  })

  it('regenerate updates list', async () => {
    const updated: ShoppingList = { ...mockList, items: [] }
    vi.mocked(shoppingApi.regenerateShoppingList).mockResolvedValue(axiosOk(updated))
    const store = useShoppingListStore()
    store.list = mockList
    await store.regenerate('mp1')
    expect(store.list).toEqual(updated)
  })

  it('regenerate sets and clears regenerating flag', async () => {
    vi.mocked(shoppingApi.regenerateShoppingList).mockResolvedValue(axiosOk(mockList))
    const store = useShoppingListStore()
    const promise = store.regenerate('mp1')
    expect(store.regenerating).toBe(true)
    await promise
    expect(store.regenerating).toBe(false)
  })

  it('toggleItem updates the item in list', async () => {
    const updatedItem: ShoppingListItem = { ...mockItem, checked: true }
    vi.mocked(shoppingApi.toggleItem).mockResolvedValue(axiosOk(updatedItem))
    const store = useShoppingListStore()
    store.list = { ...mockList, items: [mockItem] }
    await store.toggleItem('mp1', 'i1', true)
    expect(store.list!.items[0]?.checked).toBe(true)
  })

  it('toggleItem does nothing if list is null', async () => {
    const updatedItem: ShoppingListItem = { ...mockItem, checked: true }
    vi.mocked(shoppingApi.toggleItem).mockResolvedValue(axiosOk(updatedItem))
    const store = useShoppingListStore()
    // list is null — should not throw
    await store.toggleItem('mp1', 'i1', true)
    expect(store.list).toBeNull()
  })
})
