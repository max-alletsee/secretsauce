// frontend/src/composables/useToast.ts
import { reactive, readonly } from 'vue'

export interface Toast {
  id: number
  message: string
  undoLabel?: string
  onUndo?: () => void | Promise<void>
  duration: number
}

interface ToastInput {
  message: string
  undoLabel?: string
  onUndo?: () => void | Promise<void>
  duration?: number
}

const state = reactive<{ toasts: Toast[] }>({ toasts: [] })
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function show(input: ToastInput): number {
  const id = nextId++
  const toast: Toast = {
    id,
    message: input.message,
    undoLabel: input.undoLabel,
    onUndo: input.onUndo,
    duration: input.duration ?? 5000,
  }
  state.toasts.push(toast)
  const timer = setTimeout(() => dismiss(id), toast.duration)
  timers.set(id, timer)
  return id
}

function dismiss(id: number) {
  const idx = state.toasts.findIndex((t) => t.id === id)
  if (idx >= 0) state.toasts.splice(idx, 1)
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
}

async function runUndo(id: number) {
  const toast = state.toasts.find((t) => t.id === id)
  if (!toast?.onUndo) {
    dismiss(id)
    return
  }
  try {
    await toast.onUndo()
  } finally {
    dismiss(id)
  }
}

export function useToast() {
  return {
    toasts: readonly(state.toasts),
    show,
    dismiss,
    runUndo,
  }
}
