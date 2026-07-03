<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    error?: string
    id?: string
    placeholder?: string
    required?: boolean
    rows?: number
  }>(),
  {
    required: false,
    rows: 4,
  },
)

defineEmits<{
  'update:modelValue': [value: string]
}>()

// Generate a stable id if none is provided (needed for label association)
const uid = `base-textarea-${Math.random().toString(36).slice(2, 9)}`
const textareaId = computed(() => props.id ?? uid)
const errorId = computed(() => `${textareaId.value}-error`)
</script>

<template>
  <div class="textarea-wrapper">
    <label v-if="label" :for="textareaId" class="textarea__label">{{ label }}</label>
    <textarea
      :id="textareaId"
      class="textarea"
      :class="{ 'textarea--error': error }"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required || undefined"
      :rows="rows"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? errorId : undefined"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <span v-if="error" :id="errorId" class="textarea__error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.textarea-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.textarea__label {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.textarea {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.5;
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}

.textarea::placeholder {
  color: var(--color-text-muted);
}

.textarea:focus-visible {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}

.textarea--error {
  border-color: var(--color-danger);
}

.textarea--error:focus {
  box-shadow: 0 0 0 2px var(--color-danger-soft);
}

.textarea__error {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-danger);
}
</style>
