<script setup lang="ts">
import AddToPlanButton from './AddToPlanButton.vue'
import type { ShortlistEntry } from '@/types/mealPlan'

defineProps<{ entries: ShortlistEntry[] }>()
const emit = defineEmits<{
  (e: 'remove', id: string): void
}>()
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
      >
        <span class="entry-icon">{{ entry.entry_type === 'recipe' ? '📚' : '✨' }}</span>
        <span class="entry-note">{{ entry.note ?? entry.recipe_id ?? 'Unnamed entry' }}</span>
        <AddToPlanButton
          :source="{ kind: 'shortlist', entry }"
          :label="`Add ${entry.note ?? 'item'} to meal plan`"
        />
        <button
          class="remove-btn"
          :data-testid="`remove-shortlist-${entry.id}`"
          @click="emit('remove', entry.id)"
        >
          ×
        </button>
      </div>

      <p v-if="entries.length === 0" class="shortlist-empty" data-testid="shortlist-empty">
        No shortlisted items yet. Use the + button on any recipe or suggestion to save one here.
      </p>
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
.shortlist-empty {
  font-size: 0.75rem;
  color: #888;
  margin: 0;
  padding: 0.5rem 0.25rem;
  font-style: italic;
}
</style>
