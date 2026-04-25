// frontend/src/stores/useTimelineStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as timelineApi from '@/api/timeline'
import type { TimelineEntry, TimelineEntryCreate, TimelineEntryUpdate } from '@/types/timeline'

export const useTimelineStore = defineStore('timeline', () => {
  const entries = ref<TimelineEntry[]>([])
  const loading = ref(false)

  // Keyed lookup: "YYYY-MM-DD|meal_type" → TimelineEntry[]
  const entryMap = computed(() => {
    const map: Record<string, TimelineEntry[]> = {}
    for (const e of entries.value) {
      const key = `${e.date}|${e.meal_type}`
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  })

  function entriesFor(date: string, mealType: string): TimelineEntry[] {
    return entryMap.value[`${date}|${mealType}`] ?? []
  }

  async function fetchEntries(fromDate: string, toDate: string) {
    loading.value = true
    try {
      const { data } = await timelineApi.listEntries(fromDate, toDate)
      entries.value = data.entries
    } finally {
      loading.value = false
    }
  }

  async function prependEntries(fromDate: string, toDate: string) {
    const { data } = await timelineApi.listEntries(fromDate, toDate)
    // Prepend without duplicating
    const existingIds = new Set(entries.value.map((e) => e.id))
    const newEntries = data.entries.filter((e) => !existingIds.has(e.id))
    entries.value = [...newEntries, ...entries.value]
  }

  async function addEntry(data: TimelineEntryCreate): Promise<TimelineEntry> {
    const { data: entry } = await timelineApi.createEntry(data)
    entries.value.push(entry)
    return entry
  }

  async function updateEntry(entryId: string, data: TimelineEntryUpdate): Promise<TimelineEntry> {
    const { data: updated } = await timelineApi.updateEntry(entryId, data)
    const idx = entries.value.findIndex((e) => e.id === entryId)
    if (idx >= 0) entries.value[idx] = updated
    return updated
  }

  async function removeEntry(entryId: string) {
    await timelineApi.deleteEntry(entryId)
    entries.value = entries.value.filter((e) => e.id !== entryId)
  }

  return {
    entries,
    loading,
    entryMap,
    entriesFor,
    fetchEntries,
    prependEntries,
    addEntry,
    updateEntry,
    removeEntry,
  }
})
