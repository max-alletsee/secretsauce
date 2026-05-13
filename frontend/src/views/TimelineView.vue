<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import { useImportPolling } from '@/composables/useImportPolling'
import MealPlanGrid from '@/components/MealPlanGrid.vue'
import MealSuggestionPanel from '@/components/MealSuggestionPanel.vue'
import ShortlistPanel from '@/components/ShortlistPanel.vue'
import RecipeDrawer from '@/components/RecipeDrawer.vue'
import { generateRecipe } from '@/api/recipes'
import type { DragItem } from '@/types/dragItem'
import type { RecipeVersionData } from '@/types/importTask'
import type { Recipe } from '@/types/recipe'

const timelineStore = useTimelineStore()
const shortlistStore = useShortlistStore()
const recipeStore = useRecipeStore()
const userStore = useUserStore()
const planStore = useMealPlanStore()

const drawerOpen = ref(false)
const drawerRecipeId = ref<string | null>(null)
const drawerDraftRecipe = ref<RecipeVersionData | null>(null)
const convertingTitle = ref<string | null>(null)

function openRecipeDrawer(recipeId: string) {
  drawerDraftRecipe.value = null
  drawerRecipeId.value = recipeId
  drawerOpen.value = true
}

function openDraftDrawer(draft: RecipeVersionData) {
  drawerRecipeId.value = null
  drawerDraftRecipe.value = draft
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  drawerRecipeId.value = null
  drawerDraftRecipe.value = null
}

async function handleDrawerSaved(_recipe: Recipe) {
  closeDrawer()
  await recipeStore.fetchRecipes()
}

const { startPolling, error: pollingError } = useImportPolling((recipeId: string, _recipeData, resultData) => {
  convertingTitle.value = null
  const recipe = resultData?.['recipe'] as RecipeVersionData | undefined
  if (recipe?.title) {
    openDraftDrawer(recipe)
  } else if (recipeId) {
    openRecipeDrawer(recipeId)
  }
})

watch(pollingError, (err) => {
  if (err) convertingTitle.value = null
})

const convertError = ref<string | null>(null)
const shortlistError = ref<string | null>(null)

const todayStr = new Date().toISOString().slice(0, 10)

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const fromDate = ref(addDays(todayStr, -2))
const toDate = ref(addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7))

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

async function loadLater() {
  const newTo = addDays(toDate.value, 7)
  await timelineStore.appendEntries(toDate.value, newTo)
  toDate.value = newTo
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

async function handleAddToShortlist(item: DragItem) {
  shortlistError.value = null
  try {
    if (item.kind === 'suggestion') {
      const s = item.suggestion
      await shortlistStore.addEntry(
        s.matched_recipe_id
          ? { recipe_id: s.matched_recipe_id, entry_type: 'recipe', note: s.title }
          : { recipe_id: null, entry_type: 'suggestion', note: s.title }
      )
    } else if (item.kind === 'timeline-entry') {
      const entry = item.entry
      await shortlistStore.addEntry(
        entry.recipe_id
          ? { recipe_id: entry.recipe_id, entry_type: 'recipe', note: entry.note ?? undefined }
          : { recipe_id: null, entry_type: 'suggestion', note: entry.note ?? '' }
      )
    }
  } catch {
    shortlistError.value = 'Failed to save to shortlist. Please try again.'
  }
}

async function handleDropItem(item: DragItem, date: string, mealType: string) {
  if (item.kind === 'suggestion') {
    const s = item.suggestion
    if (s.entry_type === 'recipe' && s.matched_recipe_id) {
      await timelineStore.addEntry({
        date,
        meal_type: mealType,
        recipe_id: s.matched_recipe_id,
        entry_type: 'recipe',
        source: 'ai_suggested',
      })
    } else {
      await timelineStore.addEntry({
        date,
        meal_type: mealType,
        note: s.title,
        entry_type: 'suggestion',
        source: 'ai_suggested',
      })
    }
  } else if (item.kind === 'shortlist') {
    const entry = item.entry
    if (entry.recipe_id) {
      await timelineStore.addEntry({
        date,
        meal_type: mealType,
        recipe_id: entry.recipe_id,
        entry_type: 'recipe',
        source: 'manual',
      })
    } else {
      await timelineStore.addEntry({
        date,
        meal_type: mealType,
        note: entry.note ?? '',
        entry_type: 'suggestion',
        source: 'manual',
      })
    }
  }
}

async function handleConvertToRecipe(title: string) {
  if (convertingTitle.value !== null) return
  convertingTitle.value = title
  convertError.value = null
  try {
    const { data } = await generateRecipe(title)
    startPolling(data.task_id)
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    convertError.value = msg ?? 'Failed to start recipe generation. Please try again.'
    convertingTitle.value = null
  }
}
</script>

<template>
  <div class="timeline-view">
    <p v-if="convertError" class="convert-error">{{ convertError }}</p>
    <p v-if="shortlistError" class="convert-error">{{ shortlistError }}</p>
    <div class="sources-row">
      <MealSuggestionPanel
        :suggestions="planStore.suggestions"
        :loading="planStore.suggestionLoading"
        :converting-title="convertingTitle"
        @regenerate="handleRegenerate"
        @convert-to-recipe="handleConvertToRecipe"
        @open-recipe="openRecipeDrawer"
      />
      <ShortlistPanel
        :entries="shortlistStore.entries"
        @remove="handleRemoveFromShortlist"
        @add-to-shortlist="handleAddToShortlist"
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
        @drop-item="handleDropItem"
        @open-recipe="openRecipeDrawer"
      />

      <button class="show-later-btn" @click="loadLater">
        ↓ Show later
      </button>
    </div>

    <RecipeDrawer
      v-if="drawerOpen"
      :recipe-id="drawerRecipeId ?? undefined"
      :draft-recipe="drawerDraftRecipe ?? undefined"
      @close="closeDrawer"
      @saved="handleDrawerSaved"
    />
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
.show-later-btn {
  display: block;
  width: 100%;
  padding: 0.35rem;
  margin-top: 0.5rem;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #9ca3af;
  cursor: pointer;
}
.show-later-btn:hover { background: #f3f4f6; color: #6b7280; }
.convert-error {
  color: #dc2626;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
@media (max-width: 767px) {
  .sources-row { flex-direction: column; }
}
</style>
