// frontend/src/stores/useMealPlanStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as mealPlansApi from '@/api/mealPlans'
import { useSuggestionsPolling } from '@/composables/useSuggestionsPolling'
import type {
  MealPlan,
  MealPlanCreate,
  MealPlanEntry,
  MealPlanEntryCreate,
  MealPlanEntryUpdate,
  MealPlanWithEntries,
  MealSuggestion,
} from '@/types/mealPlan'

export const useMealPlanStore = defineStore('mealPlans', () => {
  const plans = ref<MealPlan[]>([])
  const currentPlan = ref<MealPlanWithEntries | null>(null)
  const suggestions = ref<MealSuggestion[]>([])
  const suggestionLoading = ref(false)
  const loading = ref(false)

  const { startPolling, status: suggestionStatus, error: suggestionError } =
    useSuggestionsPolling((incoming) => {
      suggestions.value = incoming
      suggestionLoading.value = false
    })

  async function fetchPlans() {
    loading.value = true
    try {
      const { data } = await mealPlansApi.getMealPlans()
      plans.value = data
    } finally {
      loading.value = false
    }
  }

  async function fetchPlan(id: string) {
    loading.value = true
    try {
      const { data } = await mealPlansApi.getMealPlan(id)
      currentPlan.value = data
    } finally {
      loading.value = false
    }
  }

  async function createPlan(data: MealPlanCreate): Promise<MealPlan> {
    const { data: plan } = await mealPlansApi.createMealPlan(data)
    plans.value.unshift(plan)
    return plan
  }

  async function confirmPlan(id: string) {
    const { data: updated } = await mealPlansApi.confirmMealPlan(id)
    const idx = plans.value.findIndex((p) => p.id === id)
    if (idx >= 0) plans.value[idx] = updated
    if (currentPlan.value?.id === id) {
      currentPlan.value = { ...currentPlan.value, ...updated }
    }
  }

  async function addEntry(planId: string, data: MealPlanEntryCreate): Promise<MealPlanEntry> {
    const { data: entry } = await mealPlansApi.createEntry(planId, data)
    if (currentPlan.value?.id === planId) {
      currentPlan.value.entries.push(entry)
    }
    return entry
  }

  async function updateEntry(
    planId: string,
    entryId: string,
    data: MealPlanEntryUpdate,
  ): Promise<MealPlanEntry> {
    const { data: updated } = await mealPlansApi.updateEntry(planId, entryId, data)
    if (currentPlan.value?.id === planId) {
      const idx = currentPlan.value.entries.findIndex((e) => e.id === entryId)
      if (idx >= 0) currentPlan.value.entries[idx] = updated
    }
    return updated
  }

  async function removeEntry(planId: string, entryId: string) {
    await mealPlansApi.deleteEntry(planId, entryId)
    if (currentPlan.value?.id === planId) {
      currentPlan.value.entries = currentPlan.value.entries.filter((e) => e.id !== entryId)
    }
  }

  async function generateSuggestions(steerPrompt?: string, planId?: string) {
    suggestionLoading.value = true
    suggestions.value = []
    try {
      const { data } = await mealPlansApi.requestSuggestions({
        steer_prompt: steerPrompt || undefined,
        meal_plan_id: planId,
      })
      startPolling(data.task_id)
    } catch {
      suggestionLoading.value = false
    }
  }

  return {
    plans,
    currentPlan,
    suggestions,
    suggestionLoading,
    suggestionStatus,
    suggestionError,
    loading,
    fetchPlans,
    fetchPlan,
    createPlan,
    confirmPlan,
    addEntry,
    updateEntry,
    removeEntry,
    generateSuggestions,
  }
})
