<script setup lang="ts">
import PourLoader from './PourLoader.vue'

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
    loading: false,
  },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="['btn', `btn--${variant}`, { 'btn--loading': loading }]"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true">
      <PourLoader size="sm" label="Loading" />
    </span>
    <span :class="{ 'btn__content--hidden': loading }">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.15s ease, opacity 0.15s ease;
  position: relative;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Variants */
.btn--primary {
  background: var(--color-primary);
  color: var(--color-primary-ink);
}

.btn--primary:hover:not(:disabled) {
  /* Darken the primary in-hue without a dedicated hover token and without
     borrowing --color-danger (red is reserved strictly for delete). */
  filter: brightness(0.92);
}

.btn--danger {
  background: var(--color-danger);
  color: var(--color-primary-ink);
}

.btn--danger:hover:not(:disabled) {
  opacity: 0.9;
}

.btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.btn--ghost {
  background: transparent;
  color: var(--color-primary);
  border: none;
}

.btn--ghost:hover:not(:disabled) {
  background: var(--color-primary-soft);
}

/* Loading state */
.btn__content--hidden {
  opacity: 0;
}

/* Wrapper that positions PourLoader centred over the button content */
.btn__spinner {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
