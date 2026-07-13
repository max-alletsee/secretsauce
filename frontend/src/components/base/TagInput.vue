<!-- frontend/src/components/base/TagInput.vue -->
<!--
  Free-text token/tag input: type a value, press Enter or "," to commit it
  as a tag chip; Backspace on an empty input removes the last tag; each chip
  has its own remove button. Dumb v-model<string[]> component — no API calls,
  no business logic (per frontend/CLAUDE.md component conventions).
-->
<script setup lang="ts">
import { ref } from 'vue'
import { X } from '@lucide/vue'
import IconButton from './IconButton.vue'

const model = defineModel<string[]>({ default: () => [] })

withDefaults(
  defineProps<{
    placeholder?: string
    id?: string
  }>(),
  {
    placeholder: 'Type and press Enter…',
  },
)

const draft = ref('')

function commitDraft() {
  const value = draft.value.trim()
  draft.value = ''
  if (!value) return
  if (model.value.some((t) => t.toLowerCase() === value.toLowerCase())) return
  model.value = [...model.value, value]
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    commitDraft()
  } else if (event.key === 'Backspace' && draft.value === '' && model.value.length > 0) {
    model.value = model.value.slice(0, -1)
  }
}

function removeTag(tag: string) {
  model.value = model.value.filter((t) => t !== tag)
}
</script>

<template>
  <div class="tag-input">
    <ul v-if="model.length > 0" class="tag-input__chips">
      <li v-for="tag in model" :key="tag" class="tag-input__chip">
        <span class="tag-input__chip-label">{{ tag }}</span>
        <IconButton
          :icon="X"
          :label="`Remove ${tag}`"
          :size="16"
          variant="ghost"
          class="tag-input__remove"
          @click="removeTag(tag)"
        />
      </li>
    </ul>
    <input
      :id="id"
      v-model="draft"
      type="text"
      class="tag-input__field"
      :placeholder="placeholder"
      @keydown="onKeydown"
      @blur="commitDraft"
    />
  </div>
</template>

<style scoped>
.tag-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tag-input__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.tag-input__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  padding-left: var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.5;
}

.tag-input__remove {
  padding: 2px;
}

.tag-input__field {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.tag-input__field::placeholder {
  color: var(--color-text-muted);
}

.tag-input__field:focus-visible {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}
</style>
