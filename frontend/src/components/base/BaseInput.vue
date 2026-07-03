<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    error?: string
    id?: string
    type?: string
    placeholder?: string
    required?: boolean
  }>(),
  {
    type: 'text',
    required: false,
  },
)

defineEmits<{
  'update:modelValue': [value: string]
}>()

// Generate a stable id if none is provided (needed for label association)
const uid = `base-input-${Math.random().toString(36).slice(2, 9)}`
const inputId = computed(() => props.id ?? uid)
const errorId = computed(() => `${inputId.value}-error`)
</script>

<template>
  <div class="input-wrapper">
    <label v-if="label" :for="inputId" class="input__label">{{ label }}</label>
    <input
      :id="inputId"
      class="input"
      :class="{ 'input--error': error }"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required || undefined"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? errorId : undefined"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" :id="errorId" class="input__error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.input__label {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.5;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}

.input::placeholder {
  color: var(--color-text-muted);
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}

.input--error {
  border-color: var(--color-danger);
}

.input--error:focus {
  box-shadow: 0 0 0 2px var(--color-danger-soft);
}

.input__error {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-danger);
}
</style>
