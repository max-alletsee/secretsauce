<script setup lang="ts">
import { computed, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useToast } from '@/composables/useToast'
import type { TimelineEntryCreate, TimelineEntry } from '@/types/timeline'

const props = defineProps<{
  date: string
  mealType: string
}>()

const emit = defineEmits<{
  (e: 'picked'): void
  (e: 'cancel'): void
}>()

const recipeStore = useRecipeStore()
const shortlistStore = useShortlistStore()
const planStore = useMealPlanStore()
const timelineStore = useTimelineStore()
const toast = useToast()

type Tab = 'recipes' | 'shortlist' | 'suggestions' | 'note'
const activeTab = ref<Tab>('recipes')

const search = ref('')
const noteText = ref('')
const error = ref<string | null>(null)

const filteredRecipes = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return recipeStore.recipes
  return recipeStore.recipes.filter((r) =>
    (r.current_version?.title ?? '').toLowerCase().includes(q),
  )
})

function position(): number {
  return timelineStore.entriesFor(props.date, props.mealType).length
}

function showAddedToast(created: TimelineEntry, label: string) {
  toast.show({
    message: `Added "${label}" to ${props.date} ${props.mealType}`,
    undoLabel: 'Undo',
    onUndo: async () => {
      try {
        await timelineStore.removeEntry(created.id)
      } catch {
        /* swallow */
      }
    },
  })
}

async function pickRecipe(recipeId: string, title: string) {
  const payload: TimelineEntryCreate = {
    date: props.date,
    meal_type: props.mealType,
    recipe_id: recipeId,
    entry_type: 'recipe',
    source: 'manual',
    position: position(),
  }
  try {
    const created = await timelineStore.addEntry(payload)
    showAddedToast(created, title)
    emit('picked')
  } catch {
    error.value = 'Failed to add to plan.'
  }
}

async function pickShortlist(entryId: string) {
  const entry = shortlistStore.entries.find((e) => e.id === entryId)
  if (!entry) return
  const base = {
    date: props.date,
    meal_type: props.mealType,
    position: position(),
  }
  const payload: TimelineEntryCreate = entry.recipe_id
    ? { ...base, recipe_id: entry.recipe_id, entry_type: 'recipe', source: 'manual' }
    : { ...base, note: entry.note ?? '', entry_type: 'suggestion', source: 'manual' }
  try {
    const created = await timelineStore.addEntry(payload)
    showAddedToast(created, entry.note ?? 'Shortlisted item')
    emit('picked')
  } catch {
    error.value = 'Failed to add to plan.'
  }
}

async function pickSuggestion(idx: number) {
  const s = planStore.suggestions[idx]
  if (!s) return
  const base = {
    date: props.date,
    meal_type: props.mealType,
    position: position(),
  }
  const payload: TimelineEntryCreate = s.matched_recipe_id
    ? { ...base, recipe_id: s.matched_recipe_id, entry_type: 'recipe', source: 'ai_suggested' }
    : { ...base, note: s.title, entry_type: 'suggestion', source: 'ai_suggested' }
  try {
    const created = await timelineStore.addEntry(payload)
    showAddedToast(created, s.title)
    emit('picked')
  } catch {
    error.value = 'Failed to add to plan.'
  }
}

async function submitNote() {
  const text = noteText.value.trim()
  if (!text) return
  const payload: TimelineEntryCreate = {
    date: props.date,
    meal_type: props.mealType,
    note: text,
    entry_type: 'freetext',
    source: 'manual',
    position: position(),
  }
  try {
    const created = await timelineStore.addEntry(payload)
    showAddedToast(created, text)
    emit('picked')
  } catch {
    error.value = 'Failed to add to plan.'
  }
}
</script>

<template>
  <BottomSheet
    title="Pick something to plan"
    testid="recipe-picker"
    @close="emit('cancel')"
  >
    <p v-if="error" class="picker-error">{{ error }}</p>

    <div class="picker-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'recipes'"
        :class="{ 'tab--active': activeTab === 'recipes' }"
        data-testid="picker-tab-recipes"
        @click="activeTab = 'recipes'"
      >
        Recipes
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'shortlist'"
        :class="{ 'tab--active': activeTab === 'shortlist' }"
        data-testid="picker-tab-shortlist"
        @click="activeTab = 'shortlist'"
      >
        Shortlist
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'suggestions'"
        :class="{ 'tab--active': activeTab === 'suggestions' }"
        data-testid="picker-tab-suggestions"
        @click="activeTab = 'suggestions'"
      >
        Suggestions
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'note'"
        :class="{ 'tab--active': activeTab === 'note' }"
        data-testid="picker-tab-note"
        @click="activeTab = 'note'"
      >
        Note
      </button>
    </div>

    <div v-if="activeTab === 'recipes'" class="picker-panel">
      <input
        v-model="search"
        type="text"
        class="picker-search"
        placeholder="Search recipes…"
        data-testid="recipe-picker-search"
      />
      <ul class="picker-list">
        <li v-for="r in filteredRecipes" :key="r.id">
          <button
            type="button"
            class="picker-row"
            :data-testid="`recipe-picker-recipe-${r.id}`"
            @click="pickRecipe(r.id, r.current_version?.title ?? r.id)"
          >
            {{ r.current_version?.title ?? r.id }}
          </button>
        </li>
        <li v-if="filteredRecipes.length === 0" class="picker-empty">No matches.</li>
      </ul>
    </div>

    <div v-else-if="activeTab === 'shortlist'" class="picker-panel">
      <ul class="picker-list">
        <li v-for="entry in shortlistStore.entries" :key="entry.id">
          <button
            type="button"
            class="picker-row"
            :data-testid="`recipe-picker-shortlist-${entry.id}`"
            @click="pickShortlist(entry.id)"
          >
            {{ entry.entry_type === 'recipe' ? '📚' : '✨' }}
            {{ entry.note ?? entry.recipe_id ?? 'Unnamed' }}
          </button>
        </li>
        <li v-if="shortlistStore.entries.length === 0" class="picker-empty">
          Shortlist is empty.
        </li>
      </ul>
    </div>

    <div v-else-if="activeTab === 'suggestions'" class="picker-panel">
      <ul class="picker-list">
        <li v-for="(s, i) in planStore.suggestions" :key="i">
          <button
            type="button"
            class="picker-row"
            :data-testid="`recipe-picker-suggestion-${i}`"
            @click="pickSuggestion(i)"
          >
            {{ s.matched_recipe_id ? '📚' : '✨' }} {{ s.title }}
          </button>
        </li>
        <li v-if="planStore.suggestions.length === 0" class="picker-empty">
          No AI suggestions yet.
        </li>
      </ul>
    </div>

    <div v-else-if="activeTab === 'note'" class="picker-panel">
      <input
        v-model="noteText"
        type="text"
        class="picker-search"
        placeholder="e.g. Eat out · Leftovers"
        data-testid="recipe-picker-note-input"
        @keyup.enter="submitNote"
      />
      <button
        type="button"
        class="btn btn--primary"
        data-testid="recipe-picker-note-submit"
        :disabled="!noteText.trim()"
        @click="submitNote"
      >
        Add note
      </button>
    </div>

    <div class="picker-footer">
      <button
        type="button"
        class="btn btn--secondary"
        data-testid="recipe-picker-cancel"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.picker-error {
  color: #dc2626;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}
.picker-tabs {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}
.picker-tabs button {
  background: none;
  border: none;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.picker-tabs button.tab--active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 600;
}
.picker-panel {
  min-height: 12rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.picker-search {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.picker-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 50vh;
  overflow-y: auto;
}
.picker-row {
  width: 100%;
  text-align: left;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.picker-row:hover { background: #f3f4f6; }
.picker-empty {
  color: #9ca3af;
  font-style: italic;
  font-size: 0.85rem;
  padding: 0.5rem 0.25rem;
}
.picker-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn--primary {
  background: #2563eb;
  color: #fff;
}
.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn--secondary {
  background: #f3f4f6;
  color: #374151;
}
</style>
