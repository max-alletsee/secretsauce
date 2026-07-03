<script setup lang="ts">
import { computed } from 'vue'
import { Minus, Plus } from '@lucide/vue'
import IconButton from './IconButton.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    label?: string
  }>(),
  {
    step: 1,
    label: 'Quantity',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const isAtMin = computed(() =>
  props.min !== undefined && props.modelValue <= props.min,
)

const isAtMax = computed(() =>
  props.max !== undefined && props.modelValue >= props.max,
)

function clamp(value: number): number {
  let result = value
  if (props.min !== undefined) result = Math.max(props.min, result)
  if (props.max !== undefined) result = Math.min(props.max, result)
  return result
}

function decrement() {
  emit('update:modelValue', clamp(props.modelValue - props.step))
}

function increment() {
  emit('update:modelValue', clamp(props.modelValue + props.step))
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="label">
    <IconButton
      :icon="Minus"
      label="Decrease"
      variant="secondary"
      :disabled="isAtMin"
      @click="decrement"
    />
    <span class="stepper__value" aria-live="polite">{{ modelValue }}</span>
    <IconButton
      :icon="Plus"
      label="Increase"
      variant="secondary"
      :disabled="isAtMax"
      @click="increment"
    />
  </div>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-2);
}

.stepper__value {
  min-width: 2ch;
  text-align: center;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
  user-select: none;
}
</style>
