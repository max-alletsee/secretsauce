<script setup lang="ts">
import type { MealSuggestion } from '@/types/mealPlan'
import type { DragItem } from '@/types/dragItem'

const props = defineProps<{ suggestion: MealSuggestion }>()
const emit = defineEmits<{
  (e: 'convert-to-recipe', title: string): void
  (e: 'drag-start', item: DragItem): void
}>()

function onDragStart(event: DragEvent) {
  const item: DragItem = { kind: 'suggestion', suggestion: props.suggestion }
  event.dataTransfer?.setData('application/json', JSON.stringify(item))
  emit('drag-start', item)
}
</script>

<template>
  <div
    class="suggestion-chip"
    :class="suggestion.entry_type"
    :data-testid="`chip-${suggestion.entry_type}`"
    draggable="true"
    @dragstart="onDragStart"
  >
    <span class="chip-icon">{{ suggestion.entry_type === 'recipe' ? '📚' : '✨' }}</span>
    <span class="chip-title">{{ suggestion.title }}</span>
    <button
      v-if="suggestion.entry_type === 'suggestion'"
      class="convert-btn"
      data-testid="convert-to-recipe"
      @click.stop="emit('convert-to-recipe', suggestion.title)"
    >
      → recipe
    </button>
  </div>
</template>

<style scoped>
.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: grab;
  user-select: none;
}
.suggestion-chip.recipe {
  background: #e8f0fe;
  border-left: 3px solid #4285f4;
}
.suggestion-chip.suggestion {
  background: #fff8e1;
  border-left: 3px solid #f5a623;
  font-style: italic;
}
.convert-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  margin-left: 0.25rem;
}
.convert-btn:hover { color: #333; }
</style>
