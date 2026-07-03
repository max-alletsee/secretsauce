<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import BaseButton from './BaseButton.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
  },
)

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const dialogRef = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

const FOCUSABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusables(): HTMLElement[] {
  if (!dialogRef.value) return []
  return Array.from(dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLES))
}

function trapFocus(e: KeyboardEvent) {
  if (!props.open) return

  if (e.key === 'Escape') {
    emit('cancel')
    return
  }

  if (e.key === 'Tab') {
    const focusables = getFocusables()
    if (focusables.length === 0) return
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

async function openDialog() {
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', trapFocus)
  await nextTick()
  const focusables = getFocusables()
  focusables[0]?.focus()
}

function closeDialog() {
  document.removeEventListener('keydown', trapFocus)
  lastFocused?.focus?.()
  lastFocused = null
}

// Handle open prop toggling (parent uses v-if OR the open prop)
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await openDialog()
    } else {
      closeDialog()
    }
  },
)

// Handle mount/unmount (parent uses v-if on the component itself)
onMounted(async () => {
  if (props.open) {
    await openDialog()
  }
})

onUnmounted(() => {
  if (props.open) {
    closeDialog()
  }
})
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div
        class="dialog-backdrop"
        data-testid="dialog-backdrop"
        @click="emit('cancel')"
      />
      <div
        ref="dialogRef"
        class="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`dialog-title-${title}`"
      >
        <header class="dialog-header">
          <h3 :id="`dialog-title-${title}`" class="dialog-title">{{ title }}</h3>
        </header>

        <div v-if="message" class="dialog-body">
          <p class="dialog-message">{{ message }}</p>
        </div>

        <footer class="dialog-footer">
          <BaseButton
            variant="secondary"
            data-testid="cancel-btn"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </BaseButton>
          <BaseButton
            :variant="danger ? 'danger' : 'primary'"
            data-testid="confirm-btn"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </BaseButton>
        </footer>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(40, 30, 20, 0.45);
  z-index: 399;
}

.dialog {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - var(--space-6));
  max-width: 420px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  z-index: 400;
  display: flex;
  flex-direction: column;
  animation: dialog-in 0.18s ease;
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translate(-50%, -46%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dialog {
    animation: none;
  }
}

.dialog-header {
  padding: var(--space-4) var(--space-4) 0;
}

.dialog-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.3;
}

.dialog-body {
  padding: var(--space-3) var(--space-4);
}

.dialog-message {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-4);
  padding-top: var(--space-3);
}
</style>
