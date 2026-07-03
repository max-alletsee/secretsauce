<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    :class="['toggle-chip', { 'chip--active': modelValue }]"
    :aria-pressed="modelValue"
    @click="toggle"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<style scoped>
.toggle-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  color: var(--color-text);
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.toggle-chip:hover:not(:disabled) {
  background: var(--color-accent-soft);
  border-color: transparent;
}

.toggle-chip.chip--active {
  background: var(--color-primary);
  color: var(--color-primary-ink);
  border-color: var(--color-primary);
}

.toggle-chip.chip--active:hover {
  /* darken active chip on hover (no darker-primary token exists) */
  filter: brightness(0.92);
}

.toggle-chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
