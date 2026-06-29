<script setup lang="ts">
import type { Component } from 'vue'
import BaseIcon from './BaseIcon.vue'

withDefaults(
  defineProps<{
    icon: Component
    label: string
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 16 | 20 | 24
    disabled?: boolean
  }>(),
  {
    variant: 'ghost',
    size: 20,
    disabled: false,
  },
)
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :disabled="disabled"
    :class="['icon-btn', `icon-btn--${variant}`]"
  >
    <!-- inner icon is decorative; aria-label on the button carries the accessible name -->
    <BaseIcon :icon="icon" :size="size" />
  </button>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;
  line-height: 1;
}

.icon-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Variants */
.icon-btn--primary {
  background: var(--color-primary);
  color: var(--color-primary-ink);
}

.icon-btn--primary:hover:not(:disabled) {
  /* Darken in-hue; red is reserved strictly for delete, so never borrow --color-danger here. */
  filter: brightness(0.92);
}

.icon-btn--danger {
  background: var(--color-danger);
  color: var(--color-primary-ink);
}

.icon-btn--danger:hover:not(:disabled) {
  opacity: 0.9;
}

.icon-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.icon-btn--secondary:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.icon-btn--ghost {
  background: transparent;
  color: var(--color-text);
}

.icon-btn--ghost:hover:not(:disabled) {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
</style>
