<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import MealPlanGrid from '@/components/MealPlanGrid.vue'
import MealSuggestionPanel from '@/components/MealSuggestionPanel.vue'
import ShortlistPanel from '@/components/ShortlistPanel.vue'

const timelineStore = useTimelineStore()
const shortlistStore = useShortlistStore()
const recipeStore = useRecipeStore()
const userStore = useUserStore()
const planStore = useMealPlanStore()

const todayStr = new Date().toISOString().slice(0, 10)

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const fromDate = ref(addDays(todayStr, -2))
const toDate = computed(() =>
  addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7)
)

const mealTypes = computed(() => userStore.user?.meal_plan_meal_types ?? ['dinner'])

const recipeTitles = computed(() => {
  const map: Record<string, string> = {}
  for (const recipe of recipeStore.recipes) {
    if (recipe.current_version?.title) {
      map[recipe.id] = recipe.current_version.title
    }
  }
  return map
})

onMounted(async () => {
  await Promise.all([
    timelineStore.fetchEntries(fromDate.value, toDate.value),
    shortlistStore.fetchShortlist(),
    recipeStore.fetchRecipes(),
  ])
})

async function loadEarlier() {
  const newFrom = addDays(fromDate.value, -7)
  await timelineStore.prependEntries(newFrom, addDays(fromDate.value, -1))
  fromDate.value = newFrom
}

async function handleSaveText(date: string, mealType: string, text: string) {
  await timelineStore.addEntry({ date, meal_type: mealType, note: text, entry_type: 'freetext' })
}

async function handleClearEntry(entryId: string) {
  await timelineStore.removeEntry(entryId)
}

async function handleRegenerate(steerPrompt?: string) {
  await planStore.generateSuggestions(steerPrompt, undefined)
}

async function handleRemoveFromShortlist(id: string) {
  await shortlistStore.removeEntry(id)
}
</script>

<template>
  <div class="timeline-view">
    <div class="sources-row">
      <MealSuggestionPanel
        :suggestions="planStore.suggestions"
        :loading="planStore.suggestionLoading"
        @regenerate="handleRegenerate"
      />
      <ShortlistPanel
        :entries="shortlistStore.entries"
        @remove="handleRemoveFromShortlist"
      />
    </div>

    <div class="grid-section">
      <div class="grid-header">
        <span class="grid-title">Meal Plan</span>
        <router-link to="/settings" class="settings-link">⚙ Settings</router-link>
      </div>

      <button class="show-earlier-btn" @click="loadEarlier">
        ↑ Show earlier
      </button>

      <MealPlanGrid
        :from-date="fromDate"
        :to-date="toDate"
        :meal-types="mealTypes"
        :entries="timelineStore.entries"
        :recipe-titles="recipeTitles"
        :today-str="todayStr"
        @save-text="handleSaveText"
        @clear-entry="handleClearEntry"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
}
.sources-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}
.sources-row > :first-child {
  flex: 1;
}
.grid-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}
.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.grid-title { font-weight: 600; }
.settings-link {
  font-size: 0.8rem;
  color: #6b7280;
  text-decoration: none;
}
.settings-link:hover { color: #374151; }
.show-earlier-btn {
  display: block;
  width: 100%;
  padding: 0.35rem;
  margin-bottom: 0.5rem;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #9ca3af;
  cursor: pointer;
}
.show-earlier-btn:hover { background: #f3f4f6; color: #6b7280; }
@media (max-width: 767px) {
  .sources-row { flex-direction: column; }
}
</style>
