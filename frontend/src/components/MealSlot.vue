<script setup lang="ts">
import { ref } from 'vue'
import EntryActionsMenu from './EntryActionsMenu.vue'
import RecipePicker from './RecipePicker.vue'
import type { TimelineEntry } from '@/types/timeline'

const props = defineProps<{
  entries: TimelineEntry[]
  date: string
  mealType: string
  recipeTitles: Record<string, string>
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'open-recipe', recipeId: string): void
  (e: 'move-to-slot', entry: TimelineEntry): void
  (e: 'move-to-shortlist', entry: TimelineEntry): void
  (e: 'save-to-shortlist', entry: TimelineEntry): void
  (e: 'remove', entry: TimelineEntry): void
}>()

const openMenuId = ref<string | null>(null)
const pickerOpen = ref(false)

function toggleMenu(entryId: string) {
  openMenuId.value = openMenuId.value === entryId ? null : entryId
}

function closeMenu() {
  openMenuId.value = null
}

function openPicker() {
  if (props.disabled) return
  pickerOpen.value = true
}

function closePicker() {
  pickerOpen.value = false
}

function entryLabel(entry: TimelineEntry): string {
  if (entry.entry_type === 'recipe') {
    return entry.recipe_id ? props.recipeTitles[entry.recipe_id] ?? entry.recipe_id : 'Recipe'
  }
  if (entry.entry_type === 'suggestion') return `✨ ${entry.note ?? ''}`
  return entry.note ?? ''
}

function onEntryClick(entry: TimelineEntry) {
  if (entry.entry_type === 'recipe' && entry.recipe_id) {
    emit('open-recipe', entry.recipe_id)
  }
}
</script>

<template>
  <div
    class="meal-slot"
    :class="{ 'meal-slot--disabled': disabled, 'meal-slot--multi': entries.length > 1 }"
    :data-testid="`meal-slot-${date}-${mealType}`"
  >
    <span class="slot-label">{{ mealType.toUpperCase() }}</span>

    <div class="slot-entries">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="slot-entry"
        :class="entry.entry_type"
        :data-testid="`slot-entry-${entry.id}`"
      >
        <span
          class="entry-content"
          :class="{ clickable: entry.entry_type === 'recipe' && entry.recipe_id }"
          @click.stop="onEntryClick(entry)"
        >
          {{ entryLabel(entry) }}
        </span>
        <div v-if="!disabled" class="entry-menu-wrap">
          <button
            type="button"
            class="entry-menu-btn"
            aria-label="Entry actions"
            :data-testid="`entry-menu-btn-${entry.id}`"
            @click.stop="toggleMenu(entry.id)"
          >
            ⋮
          </button>
          <EntryActionsMenu
            v-if="openMenuId === entry.id"
            :entry="entry"
            :recipe-title="entry.recipe_id ? recipeTitles[entry.recipe_id] : undefined"
            @open-recipe="(id) => emit('open-recipe', id)"
            @move-to-slot="emit('move-to-slot', entry)"
            @move-to-shortlist="emit('move-to-shortlist', entry)"
            @save-to-shortlist="emit('save-to-shortlist', entry)"
            @remove="emit('remove', entry)"
            @close="closeMenu"
          />
        </div>
      </div>

      <button
        v-if="!disabled"
        type="button"
        class="slot-add"
        :data-testid="`slot-add-${date}-${mealType}`"
        @click.stop="openPicker"
      >
        <span v-if="entries.length === 0">+ Add</span>
        <span v-else>+</span>
      </button>
    </div>

    <RecipePicker
      v-if="pickerOpen"
      :date="date"
      :meal-type="mealType"
      @picked="closePicker"
      @cancel="closePicker"
    />
  </div>
</template>

<style scoped>
.meal-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: #f0f4ff;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  min-height: 2.25rem;
}
.meal-slot--disabled { opacity: 0.6; }
.slot-label {
  font-size: 0.7rem;
  color: #999;
  font-weight: 600;
}
.slot-entries {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.slot-entry {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  position: relative;
}
.entry-content {
  flex: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-entry.recipe .entry-content { color: #1a73e8; }
.slot-entry.suggestion .entry-content { color: #f5a623; font-style: italic; }
.slot-entry.freetext .entry-content { color: #333; }
.clickable { cursor: pointer; text-decoration: underline dotted; }
.clickable:hover { text-decoration: underline; }
.entry-menu-wrap {
  position: relative;
}
.entry-menu-btn {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0 0.25rem;
}
.entry-menu-btn:hover { color: #374151; }
.slot-add {
  align-self: flex-start;
  background: none;
  border: 1px dashed #cbd5e1;
  color: #6b7280;
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.slot-add:hover { background: #e0e7ff; color: #1e3a8a; }
</style>
