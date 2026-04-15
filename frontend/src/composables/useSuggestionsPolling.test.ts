// frontend/src/composables/useSuggestionsPolling.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import type { AxiosResponse } from 'axios'
import type { ImportTask } from '@/types/importTask'

vi.mock('@/api/importTasks', () => ({
  getImportTask: vi.fn(),
}))

import * as importTasksApi from '@/api/importTasks'
import { useSuggestionsPolling } from './useSuggestionsPolling'

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

describe('useSuggestionsPolling', () => {
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
      const { status } = useSuggestionsPolling(() => {})
      expect(status.value).toBe('idle')
    })
    scope.stop()
  })

  it('starts with null error', () => {
    const scope = effectScope()
    scope.run(() => {
      const { error } = useSuggestionsPolling(() => {})
      expect(error.value).toBeNull()
    })
    scope.stop()
  })

  it('sets status to pending immediately when startPolling called', () => {
    const scope = effectScope()
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'pending' })),
      )
      const { status, startPolling } = useSuggestionsPolling(() => {})
      startPolling('task-1')
      expect(status.value).toBe('pending')
    })
    scope.stop()
  })

  it('calls onComplete with suggestions when task completes', async () => {
    const onComplete = vi.fn()
    const mockSuggestions = [{ title: 'Pasta', matched_recipe_id: null, entry_type: 'suggestion' as const }]
    const scope = effectScope()
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(
          makeTask({
            status: 'completed',
            result_data: { suggestions: mockSuggestions },
          }),
        ),
      )
      const { startPolling } = useSuggestionsPolling(onComplete)
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(onComplete).toHaveBeenCalledWith(mockSuggestions)
    scope.stop()
  })

  it('sets error and status to failed on task failure', async () => {
    const scope = effectScope()
    let capturedError: any
    let capturedStatus: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'failed', error_message: 'AI timed out' })),
      )
      const { status, error, startPolling } = useSuggestionsPolling(() => {})
      capturedStatus = status
      capturedError = error
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedStatus.value).toBe('failed')
    expect(capturedError.value).toBe('AI timed out')
    scope.stop()
  })

  it('sets error on network failure', async () => {
    const scope = effectScope()
    let capturedError: any
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockRejectedValue(new Error('Network error'))
      const { error, startPolling } = useSuggestionsPolling(() => {})
      capturedError = error
      startPolling('task-1')
    })
    await vi.runAllTimersAsync()
    expect(capturedError.value).toBe('Failed to check suggestion status')
    scope.stop()
  })

  it('stopPolling prevents further API calls', async () => {
    const scope = effectScope()
    scope.run(() => {
      vi.mocked(importTasksApi.getImportTask).mockResolvedValue(
        axiosOk(makeTask({ status: 'pending' })),
      )
      const { startPolling, stopPolling } = useSuggestionsPolling(() => {})
      startPolling('task-1')
      stopPolling()
    })
    await vi.runAllTimersAsync()
    scope.stop()
    // Called 0 times because we stopped before the first tick
    expect(importTasksApi.getImportTask).not.toHaveBeenCalled()
  })
})
