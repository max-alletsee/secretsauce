// frontend/src/composables/useToast.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useToast } from './useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // drain any leftover toasts from previous tests
    const { toasts, dismiss } = useToast()
    while (toasts.length) dismiss(toasts[0]!.id)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a toast and dismisses after duration', () => {
    const { toasts, show } = useToast()
    show({ message: 'Hello', duration: 1000 })
    expect(toasts.length).toBe(1)
    expect(toasts[0]!.message).toBe('Hello')
    vi.advanceTimersByTime(1000)
    expect(toasts.length).toBe(0)
  })

  it('dismiss removes the toast', () => {
    const { toasts, show, dismiss } = useToast()
    const id = show({ message: 'Bye', duration: 10000 })
    expect(toasts.length).toBe(1)
    dismiss(id)
    expect(toasts.length).toBe(0)
  })

  it('runUndo invokes the callback then dismisses', async () => {
    const { toasts, show, runUndo } = useToast()
    const undo = vi.fn()
    const id = show({ message: 'Did a thing', undoLabel: 'Undo', onUndo: undo })
    await runUndo(id)
    expect(undo).toHaveBeenCalled()
    expect(toasts.length).toBe(0)
  })
})
