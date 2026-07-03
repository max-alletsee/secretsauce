<script setup lang="ts">
import { ref } from 'vue'
import { CircleUser } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import IconButton from './IconButton.vue'

defineProps<{
  items: { label: string; onClick?: () => void; to?: string }[]
}>()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function handleItemClick(item: { label: string; onClick?: () => void; to?: string }) {
  item.onClick?.()
  close()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    close()
    triggerRef.value?.focus()
  }
}
</script>

<template>
  <div class="user-menu" @keydown="handleKeydown">
    <!-- Trigger -->
    <button
      ref="triggerRef"
      type="button"
      class="user-menu__trigger icon-btn icon-btn--ghost"
      aria-label="Account"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    >
      <component :is="CircleUser" :size="20" aria-hidden="true" />
    </button>

    <!-- Dropdown menu -->
    <ul v-if="open" role="menu" class="user-menu__list">
      <li
        v-for="item in items"
        :key="item.label"
        role="menuitem"
        class="user-menu__item"
        @click="handleItemClick(item)"
      >
        <RouterLink v-if="item.to" :to="item.to" class="user-menu__link" tabindex="-1">
          {{ item.label }}
        </RouterLink>
        <span v-else class="user-menu__action">{{ item.label }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
  display: inline-flex;
}

/* Reuse icon-btn token styles (inline so we don't depend on global class leakage) */
.user-menu__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.user-menu__trigger:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.user-menu__trigger:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
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
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text);
  text-decoration: none;
  white-space: nowrap;
}

.user-menu__action {
  cursor: pointer;
  width: 100%;
  text-align: left;
}
</style>
