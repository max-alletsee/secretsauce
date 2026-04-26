// frontend/src/api/shoppingLists.ts
import client from './client'
import type { ShoppingList, ShoppingListItem, ShoppingListSummary } from '@/types/shoppingList'
import type { ImportTaskCreated } from '@/types/importTask'

export const listShoppingLists = () =>
  client.get<ShoppingListSummary[]>('/shopping-lists')

export const generateShoppingList = (entryIds: string[], name: string) =>
  client.post<ImportTaskCreated>('/shopping-lists/generate', { entry_ids: entryIds, name })

export const getShoppingList = (id: string) =>
  client.get<ShoppingList>(`/shopping-lists/${id}`)

export const regenerateShoppingList = (mealPlanId: string) =>
  client.post<ShoppingList>(`/shopping-lists/${mealPlanId}/regenerate`)

export const toggleItem = (mealPlanId: string, itemId: string, checked: boolean) =>
  client.patch<ShoppingListItem>(`/shopping-lists/${mealPlanId}/items/${itemId}`, { checked })
