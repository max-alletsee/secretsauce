// frontend/src/composables/useImportPolling.ts
import { ref, onScopeDispose } from 'vue'
import * as importTasksApi from '@/api/importTasks'
import type { ImportStatus } from '@/types/importTask'

export function useImportPolling(onComplete: (recipeId: string) => void) {
  const status = ref<ImportStatus>('idle')
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
        status.value = task.status as ImportStatus
        if (task.status === 'completed' && task.recipe_id) {
          stopPolling()
          onComplete(task.recipe_id)
        } else if (task.status === 'failed') {
          stopPolling()
          error.value = task.error_message ?? 'Import failed'
        }
      } catch {
        stopPolling()
        error.value = 'Failed to check import status'
        status.value = 'failed'
      }
    }, 3000)
  }

  onScopeDispose(stopPolling)

  return { status, error, startPolling, stopPolling }
}
