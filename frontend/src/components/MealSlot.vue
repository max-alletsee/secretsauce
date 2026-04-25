<script setup lang="ts">
import { ref } from 'vue'
import type { TimelineEntry } from '@/types/timeline'

const props = defineProps<{
  entry: TimelineEntry | null
  mealType: string
  recipeTitle?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'save-text', text: string): void
  (e: 'clear'): void
}>()

const editing = ref(false)
const inputText = ref('')

function startEditing() {
  editing.value = true
  inputText.value = ''
}

function submitText() {
  if (inputText.value.trim()) {
    emit('save-text', inputText.value.trim())
  }
  editing.value = false
}

function cancelEdit() {
  editing.value = false
}
</script>

<template>
  <div
    class="meal-slot"
    :class="[entry?.entry_type, { 'meal-slot--disabled': disabled }]"
  >
    <span class="slot-label">{{ mealType.toUpperCase() }}</span>

    <div v-if="editing" class="slot-edit">
      <input
        v-model="inputText"
        data-testid="slot-text-input"
        type="text"
        placeholder="Type a note…"
        autofocus
        @keyup.enter="submitText"
        @keyup.escape="cancelEdit"
      />
    </div>

    <span v-else-if="entry && entry.entry_type === 'recipe'" class="slot-content recipe">
      {{ recipeTitle ?? entry.recipe_id }}
    </span>
    <span v-else-if="entry && entry.entry_type === 'suggestion'" class="slot-content suggestion">
      ✨ {{ entry.note }}
    </span>
    <span v-else-if="entry && entry.entry_type === 'freetext'" class="slot-content freetext">
      {{ entry.note }}
    </span>
    <span
      v-else
      class="slot-empty"
      data-testid="slot-empty"
      @click="!disabled && startEditing()"
    >
      drop here…
    </span>

    <button
      v-if="entry && !editing"
      class="clear-btn"
      data-testid="slot-clear"
      @click.stop="emit('clear')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.meal-slot {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: #f0f4ff;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  min-height: 2.25rem;
  cursor: pointer;
}
.meal-slot--disabled { cursor: default; }
.slot-label { font-size: 0.7rem; color: #999; font-weight: 600; flex-shrink: 0; }
.slot-content { flex: 1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slot-content.recipe { color: #1a73e8; }
.slot-content.suggestion { color: #f5a623; font-style: italic; }
.slot-content.freetext { color: #333; }
.slot-empty { flex: 1; font-size: 0.85rem; color: #bbb; font-style: italic; }
.slot-edit { flex: 1; }
.slot-edit input { width: 100%; border: none; background: transparent; font-size: 0.9rem; outline: none; }
.clear-btn { background: none; border: none; color: #ccc; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0; flex-shrink: 0; }
.clear-btn:hover { color: #e94560; }
</style>
