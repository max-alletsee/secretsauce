<script setup lang="ts">
import AddToPlanButton from './AddToPlanButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import { X, BookOpen, Lightbulb } from '@lucide/vue'
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
        <span class="entry-icon">
          <BaseIcon
            :icon="entry.entry_type === 'recipe' ? BookOpen : Lightbulb"
            :size="16"
            :label="entry.entry_type === 'recipe' ? 'Recipe' : 'Idea'"
          />
        </span>
        <span class="entry-note">{{ entry.note ?? entry.recipe_id ?? 'Unnamed entry' }}</span>
        <AddToPlanButton
          :source="{ kind: 'shortlist', entry }"
          :label="`Add ${entry.note ?? 'item'} to meal plan`"
        />
        <button
          class="remove-btn"
          :aria-label="`Remove ${entry.note ?? 'item'} from shortlist`"
          :data-testid="`remove-shortlist-${entry.id}`"
          @click="emit('remove', entry.id)"
        >
          <BaseIcon :icon="X" />
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
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
  padding: 0.75rem 1rem;
  min-width: 180px;
}
.panel-header { margin-bottom: 0.5rem; }
.panel-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
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
.entry-icon {
  display: inline-flex;
  align-items: center;
}
.shortlist-entry.recipe { background: var(--color-primary-soft); border-left: 3px solid var(--color-success); }
.shortlist-entry.suggestion { background: var(--color-accent-soft); border-left: 3px solid var(--color-success); font-style: italic; }
.entry-note { flex: 1; }
.remove-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
.remove-btn:hover { color: var(--color-text); }
.shortlist-empty {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0;
  padding: 0.5rem 0.25rem;
  font-style: italic;
}
</style>
