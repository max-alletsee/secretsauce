// frontend/src/stores/useShoppingListStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as shoppingApi from '@/api/shoppingLists'
import type { ShoppingList } from '@/types/shoppingList'

export const useShoppingListStore = defineStore('shoppingList', () => {
  const list = ref<ShoppingList | null>(null)
  const loading = ref(false)
  const regenerating = ref(false)

  async function fetchList(mealPlanId: string) {
    loading.value = true
    try {
      const { data } = await shoppingApi.getShoppingList(mealPlanId)
      list.value = data
    } finally {
      loading.value = false
    }
  }

  async function regenerate(mealPlanId: string) {
    regenerating.value = true
    try {
      const { data } = await shoppingApi.regenerateShoppingList(mealPlanId)
      list.value = data
    } finally {
      regenerating.value = false
    }
  }

  async function toggleItem(mealPlanId: string, itemId: string, checked: boolean) {
    const { data } = await shoppingApi.toggleItem(mealPlanId, itemId, checked)
    if (list.value) {
      const idx = list.value.items.findIndex((i) => i.id === itemId)
      if (idx >= 0) list.value.items[idx] = data
    }
  }

  async function updateItemQuantity(mealPlanId: string, itemId: string, quantity: number, unit: string) {
    const { data } = await shoppingApi.updateItemQuantity(mealPlanId, itemId, quantity, unit)
    if (list.value) {
      const idx = list.value.items.findIndex((i) => i.id === itemId)
      if (idx >= 0) list.value.items[idx] = data
    }
  }

  async function addItem(mealPlanId: string, ingredientName: string, quantity: number, unit: string) {
    const { data } = await shoppingApi.addItem(mealPlanId, ingredientName, quantity, unit)
    if (list.value) {
      list.value.items.push(data)
    }
  }

  return { list, loading, regenerating, fetchList, regenerate, toggleItem, updateItemQuantity, addItem }
})
