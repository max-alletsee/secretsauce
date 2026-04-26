<script setup lang="ts">
import type { ShortlistEntry } from '@/types/mealPlan'
import type { DragItem } from '@/types/dragItem'

defineProps<{ entries: ShortlistEntry[] }>()
const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'drag-start', item: DragItem): void
}>()

function onDragStart(event: DragEvent, entry: ShortlistEntry) {
  const item: DragItem = { kind: 'shortlist', entry }
  event.dataTransfer?.setData('application/json', JSON.stringify(item))
  emit('drag-start', item)
}
</script>

<template>
  <div class="shortlist-panel">
    <div class="panel-header">
      <span class="panel-label">Shortlist ★</span>
    </div>

    <div class="entry-list">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="shortlist-entry"
        :class="entry.entry_type"
        draggable="true"
        @dragstart="(e) => onDragStart(e, entry)"
      >
        <span class="entry-icon">{{ entry.entry_type === 'recipe' ? '📚' : '✨' }}</span>
        <span class="entry-note">{{ entry.note ?? entry.recipe_id }}</span>
        <button
          class="remove-btn"
          :data-testid="`remove-shortlist-${entry.id}`"
          @click="emit('remove', entry.id)"
        >
          ×
        </button>
      </div>

      <div class="drop-zone">drop here to save for later</div>
    </div>
  </div>
</template>

<style scoped>
.shortlist-panel {
  background: #f0fff4;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-width: 180px;
}
.panel-header { margin-bottom: 0.5rem; }
.panel-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  font-weight: 600;
}
.entry-list { display: flex; flex-direction: column; gap: 0.35rem; }
.shortlist-entry {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: grab;
}
.shortlist-entry.recipe { background: #e8f0fe; border-left: 3px solid #2ecc71; }
.shortlist-entry.suggestion { background: #fff8e1; border-left: 3px solid #27ae60; font-style: italic; }
.entry-note { flex: 1; }
.remove-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
.remove-btn:hover { color: #e94560; }
.drop-zone {
  border: 1px dashed #ccc;
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  font-size: 0.75rem;
  color: #aaa;
  text-align: center;
}
</style>
