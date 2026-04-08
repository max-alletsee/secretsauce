// frontend/src/composables/useSuggestionsPolling.ts
import { ref, onScopeDispose } from 'vue'
import * as importTasksApi from '@/api/importTasks'
import type { MealSuggestion } from '@/types/mealPlan'

export function useSuggestionsPolling(onComplete: (suggestions: MealSuggestion[]) => void) {
  const status = ref<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle')
  const error = ref<string | null>(null)
  let intervalId: ReturnType<typeof setInterval> | null = null

  function stopPolling() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function startPolling(taskId: string) {
    status.value = 'pending'
    error.value = null
    intervalId = setInterval(async () => {
      try {
        const { data: task } = await importTasksApi.getImportTask(taskId)
        status.value = task.status as typeof status.value
        if (task.status === 'completed') {
          stopPolling()
          const suggestions = (task.result_data?.suggestions ?? []) as MealSuggestion[]
          onComplete(suggestions)
        } else if (task.status === 'failed') {
          stopPolling()
          error.value = task.error_message ?? 'Suggestion generation failed'
        }
      } catch {
        stopPolling()
        error.value = 'Failed to check suggestion status'
        status.value = 'failed'
      }
    }, 3000)
  }

  onScopeDispose(stopPolling)

  return { status, error, startPolling, stopPolling }
}
