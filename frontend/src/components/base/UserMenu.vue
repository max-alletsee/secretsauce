<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { CircleUser } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import IconButton from './IconButton.vue'

defineProps<{
  items: { label: string; onClick?: () => void; to?: string; testid?: string }[]
}>()

const open = ref(false)
// ref to the IconButton component — its root element is the <button>
const triggerRef = ref<InstanceType<typeof IconButton> | null>(null)
// ref to the menu root <div> for click-outside detection
const menuRootRef = ref<HTMLElement | null>(null)

function focusTrigger() {
  ;(triggerRef.value?.$el as HTMLElement | undefined)?.focus()
}

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function handleItemClick(item: { label: string; onClick?: () => void; to?: string; testid?: string }) {
  item.onClick?.()
  close()
}

// document-level handlers — defined at module scope so we can removeEventListener with the same reference
function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    close()
    focusTrigger()
  }
}

function onDocumentPointerdown(e: PointerEvent) {
  if (!open.value) return
  const root = menuRootRef.value
  if (root && !root.contains(e.target as Node)) {
    close()
  }
}

// Add/remove document listeners whenever the menu opens/closes
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onDocumentKeydown)
    document.addEventListener('pointerdown', onDocumentPointerdown)
  } else {
    document.removeEventListener('keydown', onDocumentKeydown)
    document.removeEventListener('pointerdown', onDocumentPointerdown)
  }
})

// Always clean up on unmount to prevent leaks
onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerdown)
})
</script>

<template>
  <div ref="menuRootRef" class="user-menu">
    <!-- Trigger — use IconButton primitive; its root element is <button> -->
    <IconButton
      ref="triggerRef"
      :icon="CircleUser"
      label="Account"
      variant="ghost"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    />

    <!-- Dropdown menu -->
    <ul v-if="open" role="menu" class="user-menu__list">
      <li
        v-for="item in items"
        :key="item.label"
        role="none"
        class="user-menu__item"
      >
        <!-- Navigation item: RouterLink is the interactive element -->
        <RouterLink
          v-if="item.to"
          :to="item.to"
          role="menuitem"
          class="user-menu__link"
          :data-testid="item.testid"
          @click="handleItemClick(item)"
        >
          {{ item.label }}
        </RouterLink>

        <!-- Action item: keyboard-accessible <button> is the interactive element -->
        <button
          v-else
          type="button"
          role="menuitem"
          class="user-menu__action"
          :data-testid="item.testid"
          @click="handleItemClick(item)"
        >
          {{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
  display: inline-flex;
}

.user-menu__list {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  z-index: 200;
  min-width: 11rem;
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.user-menu__item {
  cursor: pointer;
}

.user-menu__item:hover {
  background: var(--color-surface-2);
}

.user-menu__link,
.user-menu__action {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text);
  text-decoration: none;
  white-space: nowrap;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
}
</style>
