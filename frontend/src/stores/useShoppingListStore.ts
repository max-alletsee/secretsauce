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

  return { list, loading, regenerating, fetchList, regenerate, toggleItem }
})
