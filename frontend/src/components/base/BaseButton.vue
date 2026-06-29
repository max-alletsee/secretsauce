<script setup lang="ts">
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
    <!-- TODO: replace with PourLoader once available (Task 0.9) -->
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
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

.btn__spinner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  /* Inherit the button's text color so the spinner is visible on every variant
     (primary-ink on filled variants, text color on secondary/ghost). */
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: btn-spin 0.6s linear infinite;
  position: absolute;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
