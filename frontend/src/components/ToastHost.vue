<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismiss, runUndo } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" data-testid="toast-host">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        role="status"
        :data-testid="`toast-${toast.id}`"
      >
        <span class="toast-message">{{ toast.message }}</span>
        <button
          v-if="toast.undoLabel"
          class="toast-undo"
          data-testid="assignment-undo"
          @click="runUndo(toast.id)"
        >
          {{ toast.undoLabel }}
        </button>
        <button
          class="toast-close"
          aria-label="Dismiss"
          @click="dismiss(toast.id)"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 400;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #1f2937;
  color: #fff;
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  font-size: 0.875rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  min-width: 260px;
  max-width: 90vw;
}
.toast-message { flex: 1; }
.toast-undo {
  background: none;
  border: none;
  color: #93c5fd;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
}
.toast-undo:hover { color: #bfdbfe; }
.toast-close {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0;
}
.toast-close:hover { color: #fff; }
</style>
