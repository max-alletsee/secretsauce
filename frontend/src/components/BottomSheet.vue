<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { X } from '@lucide/vue'
import IconButton from './base/IconButton.vue'

const props = defineProps<{
  title?: string
  testid?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const sheetRef = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  if (e.key === 'Tab' && sheetRef.value) {
    const focusables = sheetRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
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

onMounted(async () => {
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', onKeyDown)
  await nextTick()
  const focusables = sheetRef.value?.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  focusables?.[0]?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  lastFocused?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="sheet-backdrop" @click="emit('close')" />
    <div
      ref="sheetRef"
      class="bottom-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="props.title"
      :data-testid="props.testid"
    >
      <header v-if="props.title" class="sheet-header">
        <h3 class="sheet-title">{{ props.title }}</h3>
        <IconButton
          :icon="X"
          label="Close"
          variant="ghost"
          :size="20"
          data-testid="sheet-close"
          @click="emit('close')"
        />
      </header>
      <IconButton
        v-else
        :icon="X"
        label="Close"
        variant="ghost"
        :size="20"
        class="sheet-close--floating"
        data-testid="sheet-close"
        @click="emit('close')"
      />
      <div class="sheet-body">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 299;
}
.bottom-sheet {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  max-height: 85dvh;
  background: var(--color-surface);
  z-index: 300;
  border-radius: var(--radius) var(--radius) 0 0;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  animation: slide-up 0.18s ease;
}
@keyframes slide-up {
  from { transform: translate(-50%, 100%); }
  to { transform: translate(-50%, 0); }
}
.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.sheet-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
}
.sheet-close--floating {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}
.sheet-body {
  padding: var(--space-4) var(--space-4) var(--space-5);
  overflow-y: auto;
}
@media (min-width: 768px) {
  .bottom-sheet {
    bottom: auto;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: var(--radius);
    animation: fade-in 0.15s ease;
  }
  @keyframes fade-in {
    from { transform: translate(-50%, -45%); opacity: 0; }
    to { transform: translate(-50%, -50%); opacity: 1; }
  }
}
@media (prefers-reduced-motion: reduce) {
  .bottom-sheet {
    animation: none !important;
  }
}
</style>
