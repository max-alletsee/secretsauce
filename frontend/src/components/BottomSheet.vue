<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick } from 'vue'

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
        <button
          class="sheet-close"
          aria-label="Close"
          data-testid="sheet-close"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <button
        v-else
        class="sheet-close sheet-close--floating"
        aria-label="Close"
        data-testid="sheet-close"
        @click="emit('close')"
      >
        ×
      </button>
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
  background: #fff;
  z-index: 300;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
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
  padding: 0.875rem 1.125rem;
  border-bottom: 1px solid #e5e7eb;
}
.sheet-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.sheet-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem 0.5rem;
}
.sheet-close:hover { color: #111; }
.sheet-close--floating {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}
.sheet-body {
  padding: 1rem 1.125rem 1.25rem;
  overflow-y: auto;
}
@media (min-width: 768px) {
  .bottom-sheet {
    bottom: auto;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 12px;
    animation: fade-in 0.15s ease;
  }
  @keyframes fade-in {
    from { transform: translate(-50%, -45%); opacity: 0; }
    to { transform: translate(-50%, -50%); opacity: 1; }
  }
}
</style>
