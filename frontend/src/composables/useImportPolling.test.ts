// frontend/src/composables/useImportPolling.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import type { AxiosResponse } from 'axios'
import type { ImportTask } from '@/types/importTask'

vi.mock('@/api/importTasks', () => ({
  getImportTask: vi.fn(),
}))

import * as importTasksApi from '@/api/importTasks'
import { useImportPolling } from './useImportPolling'

function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>
}

function makeTask(overrides: Partial<ImportTask> = {}): ImportTask {
  return {
    id: 'task-1',
    status: 'pending',
    recipe_id: null,
    error_message: null,
    import_type: 'url',
    result_data: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('useImportPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with idle status', () => {
    const scope = effectScope()
    scope.run(() => {
      const { status } = useImportPolling(() => {})
      expect(status.value).toBe('idle')
    })
    scope.stop()
  })

  it('starts with null error', () => {
    const scope = effectScope()
    scope.run(() => {
      const { error } = useImportPolling(() => {})
      expect(error.value).toBeNull()
    })
    scope.stop()
  })

  it('sets status to pending immediately when startPolling called', () => {
    const scope = effectScope()
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'processing' })),
      )
      const { status, startPolling } = useImportPolling(() => {})
      startPolling('task-1')
      expect(status.value).toBe('pending')
    })
    scope.stop()
  })

  it('calls onComplete with recipeId when task completes', async () => {
    const onComplete = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'completed', recipe_id: 'recipe-42' })),
      )
      const { startPolling } = useImportPolling(onComplete)
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(onComplete).toHaveBeenCalledWith('recipe-42')
    scope.stop()
  })

  it('sets error and failed status when task fails', async () => {
    const scope = effectScope()
    let capturedError: any
    let capturedStatus: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'failed', error_message: 'Gemini timed out' })),
      )
      const { status, error, startPolling } = useImportPolling(() => {})
      capturedError = error
      capturedStatus = status
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedError.value).toBe('Gemini timed out')
    expect(capturedStatus.value).toBe('failed')
    scope.stop()
  })

  it('uses default error message when task.error_message is null', async () => {
    const scope = effectScope()
    let capturedError: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'failed', error_message: null })),
      )
      const { error, startPolling } = useImportPolling(() => {})
      capturedError = error
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedError.value).toBe('Import failed')
    scope.stop()
  })

  it('sets error when polling API call throws', async () => {
    const scope = effectScope()
    let capturedError: any
    let capturedStatus: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockRejectedValue(new Error('network'))
      const { status, error, startPolling } = useImportPolling(() => {})
      capturedError = error
      capturedStatus = status
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedError.value).toBe('Failed to check import status')
    expect(capturedStatus.value).toBe('failed')
    scope.stop()
  })
})
