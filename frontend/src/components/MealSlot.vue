<script setup lang="ts">
import { ref } from 'vue'
import type { TimelineEntry } from '@/types/timeline'
import type { DragItem } from '@/types/dragItem'

const props = defineProps<{
  entry: TimelineEntry | null
  mealType: string
  recipeTitle?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'save-text', text: string): void
  (e: 'clear'): void
  (e: 'drop-item', item: DragItem): void
  (e: 'drag-start', item: DragItem): void
  (e: 'open-recipe', recipeId: string): void
}>()

const editing = ref(false)
const inputText = ref('')
const dragOver = ref(false)

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

function onEntryDragStart(event: DragEvent) {
  if (!props.entry) return
  const item: DragItem = { kind: 'timeline-entry', entry: props.entry }
  event.dataTransfer?.setData('application/json', JSON.stringify(item))
  emit('drag-start', item)
}

function onDragOver(event: DragEvent) {
  if (props.disabled) return
  event.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  if (props.disabled) return
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const item: DragItem = JSON.parse(raw)
    emit('drop-item', item)
  } catch {
    // ignore malformed drag data
  }
}
</script>

<template>
  <div
    class="meal-slot"
    :class="[entry?.entry_type, { 'meal-slot--disabled': disabled, 'meal-slot--drag-over': dragOver }]"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
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

    <span
      v-else-if="entry && entry.entry_type === 'recipe'"
      class="slot-content recipe clickable"
      draggable="true"
      @dragstart.stop="onEntryDragStart"
      @click.stop="entry.recipe_id && emit('open-recipe', entry.recipe_id)"
    >
      {{ recipeTitle ?? entry.recipe_id }}
    </span>
    <span
      v-else-if="entry && entry.entry_type === 'suggestion'"
      class="slot-content suggestion"
      draggable="true"
      @dragstart.stop="onEntryDragStart"
    >
      ✨ {{ entry.note }}
    </span>
    <span
      v-else-if="entry && entry.entry_type === 'freetext'"
      class="slot-content freetext"
      draggable="true"
      @dragstart.stop="onEntryDragStart"
    >
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
      v-if="entry && !editing && !disabled"
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
  transition: background 0.1s;
}
.meal-slot--disabled { cursor: default; }
.meal-slot--drag-over { background: #dbeafe; outline: 2px dashed #2563eb; }
.slot-label { font-size: 0.7rem; color: #999; font-weight: 600; flex-shrink: 0; }
.slot-content { flex: 1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slot-content.recipe { color: #1a73e8; }
.clickable { cursor: pointer; text-decoration: underline dotted; }
.clickable:hover { text-decoration: underline; }
.slot-content.suggestion { color: #f5a623; font-style: italic; }
.slot-content.freetext { color: #333; }
.slot-empty { flex: 1; font-size: 0.85rem; color: #bbb; font-style: italic; }
.slot-edit { flex: 1; }
.slot-edit input { width: 100%; border: none; background: transparent; font-size: 0.9rem; outline: none; }
.clear-btn { background: none; border: none; color: #ccc; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0; flex-shrink: 0; }
.clear-btn:hover { color: #e94560; }
</style>
