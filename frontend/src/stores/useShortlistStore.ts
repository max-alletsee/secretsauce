// frontend/src/stores/useShortlistStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as mealPlansApi from '@/api/mealPlans'
import type { ShortlistEntry, ShortlistEntryCreate } from '@/types/mealPlan'

export const useShortlistStore = defineStore('shortlist', () => {
  const entries = ref<ShortlistEntry[]>([])
  const loading = ref(false)

  async function fetchShortlist() {
    loading.value = true
    try {
      const { data } = await mealPlansApi.getShortlist()
      entries.value = data
    } finally {
      loading.value = false
    }
  }

  async function addEntry(data: ShortlistEntryCreate): Promise<ShortlistEntry> {
    const { data: entry } = await mealPlansApi.addToShortlist(data)
    entries.value.push(entry)
    return entry
  }

  async function removeEntry(id: string) {
    await mealPlansApi.removeFromShortlist(id)
    entries.value = entries.value.filter((e) => e.id !== id)
  }

  async function reorder(orderedIds: string[]) {
    const { data: reordered } = await mealPlansApi.reorderShortlist(orderedIds)
    entries.value = reordered
  }

  return { entries, loading, fetchShortlist, addEntry, removeEntry, reorder }
})
