// frontend/src/api/shoppingLists.ts
import client from './client'
import type { ShoppingList, ShoppingListItem } from '@/types/shoppingList'

export const getShoppingList = (mealPlanId: string) =>
  client.get<ShoppingList>(`/shopping-lists/${mealPlanId}`)

export const regenerateShoppingList = (mealPlanId: string) =>
  client.post<ShoppingList>(`/shopping-lists/${mealPlanId}/regenerate`)

export const toggleItem = (mealPlanId: string, itemId: string, checked: boolean) =>
  client.patch<ShoppingListItem>(`/shopping-lists/${mealPlanId}/items/${itemId}`, { checked })
