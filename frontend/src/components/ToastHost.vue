<script setup lang="ts">
import { X } from '@lucide/vue'
import IconButton from './base/IconButton.vue'
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
        <IconButton
          :icon="X"
          label="Dismiss"
          variant="ghost"
          :size="16"
          class="toast-close-btn"
          @click="dismiss(toast.id)"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  z-index: 400;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  font-size: var(--text-sm);
  box-shadow: var(--shadow);
  min-width: 260px;
  max-width: 90vw;
}
.toast-message { flex: 1; }
.toast-undo {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  font-size: var(--text-sm);
  padding: 0;
}
.toast-undo:hover {
  filter: brightness(0.85);
}
.toast-close-btn {
  /* Tighten the ghost button in the toast context */
  color: var(--color-text-muted);
}
</style>
