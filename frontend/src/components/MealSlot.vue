<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { Coffee, Sandwich, Soup, Utensils, Lightbulb } from '@lucide/vue'
import BaseCard from './base/BaseCard.vue'
import BaseIcon from './base/BaseIcon.vue'
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
  (e: 'save-to-shortlist', entry: TimelineEntry): void
  (e: 'remove', entry: TimelineEntry): void
}>()

const openMenuId = ref<string | null>(null)
const menuAnchor = ref({ top: 0, right: 0 })
const pickerOpen = ref(false)

const MEAL_TYPE_ICONS: Record<string, Component> = {
  breakfast: Coffee,
  lunch: Sandwich,
  dinner: Soup,
}

// Meal-type tint class — falls back to a neutral "other" tint (e.g. snack)
// so the card still gets an accent bar even for meal types outside the
// three named tokens.
const mealTypeTintClass = computed(() => {
  const known = ['breakfast', 'lunch', 'dinner']
  return known.includes(props.mealType) ? `meal-slot--${props.mealType}` : 'meal-slot--other'
})

const mealTypeIcon = computed<Component>(() => MEAL_TYPE_ICONS[props.mealType] ?? Utensils)

function toggleMenu(entryId: string, event: MouseEvent) {
  if (openMenuId.value === entryId) {
    openMenuId.value = null
    return
  }
  const btn = event.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  menuAnchor.value = { top: rect.bottom, right: window.innerWidth - rect.right }
  openMenuId.value = entryId
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
  if (entry.entry_type === 'suggestion') return entry.note ?? ''
  return entry.note ?? ''
}

function onEntryClick(entry: TimelineEntry) {
  if (entry.entry_type === 'recipe' && entry.recipe_id) {
    emit('open-recipe', entry.recipe_id)
  }
}
</script>

<template>
  <BaseCard
    class="meal-slot"
    :class="[
      mealTypeTintClass,
      { 'meal-slot--disabled': disabled, 'meal-slot--multi': entries.length > 1 },
    ]"
    :data-testid="`meal-slot-${date}-${mealType}`"
  >
    <span class="slot-label">
      <BaseIcon :icon="mealTypeIcon" :size="16" :label="`${mealType} icon`" />
      {{ mealType.toUpperCase() }}
    </span>

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
          <BaseIcon
            v-if="entry.entry_type === 'suggestion'"
            :icon="Lightbulb"
            :size="16"
            label="Idea"
          />
          {{ entryLabel(entry) }}
        </span>
        <div v-if="!disabled" class="entry-menu-wrap">
          <button
            type="button"
            class="entry-menu-btn"
            aria-label="Entry actions"
            :data-testid="`entry-menu-btn-${entry.id}`"
            @click.stop="toggleMenu(entry.id, $event)"
          >
            ⋮
          </button>
          <EntryActionsMenu
            v-if="openMenuId === entry.id"
            :entry="entry"
            :anchor="menuAnchor"
            :recipe-title="entry.recipe_id ? recipeTitles[entry.recipe_id] : undefined"
            @open-recipe="(id) => emit('open-recipe', id)"
            @move-to-slot="emit('move-to-slot', entry)"
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
  </BaseCard>
</template>

<style scoped>
.meal-slot {
  flex: 1 1 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  min-height: 2.25rem;
  border-left: 4px solid var(--color-border);
}

@media (min-width: 768px) {
  .meal-slot {
    flex: 1 1 0;
  }
}

.meal-slot--breakfast { border-left-color: var(--meal-breakfast); background: var(--meal-breakfast); }
.meal-slot--lunch { border-left-color: var(--meal-lunch); background: var(--meal-lunch); }
.meal-slot--dinner { border-left-color: var(--meal-dinner); background: var(--meal-dinner); }
.meal-slot--other { border-left-color: var(--color-accent-soft); background: var(--color-accent-soft); }

.meal-slot--disabled { opacity: 0.6; }

.slot-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.slot-entries {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.slot-entry {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  position: relative;
}
.entry-content {
  flex: 1;
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.slot-entry.recipe .entry-content { color: var(--color-primary); }
.slot-entry.suggestion .entry-content { color: var(--color-warning); font-style: italic; }
.slot-entry.freetext .entry-content { color: var(--color-text); }
.clickable { cursor: pointer; text-decoration: underline dotted; }
.clickable:hover { text-decoration: underline; }
.entry-menu-wrap {
  position: relative;
}
.entry-menu-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
}
.entry-menu-btn:hover { color: var(--color-text); background: var(--color-surface-2); }
.slot-add {
  align-self: flex-start;
  background: none;
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  cursor: pointer;
}
.slot-add:hover { background: var(--color-primary-soft); color: var(--color-primary); }
</style>
