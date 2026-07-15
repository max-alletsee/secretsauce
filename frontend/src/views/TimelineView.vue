<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import { useImportPolling } from '@/composables/useImportPolling'
import { useToast } from '@/composables/useToast'
import { formatDateRange } from '@/composables/useDateRange'
import MealPlanGrid from '@/components/MealPlanGrid.vue'
import MealSuggestionPanel from '@/components/MealSuggestionPanel.vue'
import ShortlistPanel from '@/components/ShortlistPanel.vue'
import RecipeDrawer from '@/components/RecipeDrawer.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import DayMealPicker from '@/components/DayMealPicker.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { generateRecipe } from '@/api/recipes'
import type { DraftRecipeData } from '@/types/importTask'
import type { Recipe } from '@/types/recipe'
import type { TimelineEntry, TimelineEntryCreate } from '@/types/timeline'

const timelineStore = useTimelineStore()
const shortlistStore = useShortlistStore()
const recipeStore = useRecipeStore()
const userStore = useUserStore()
const planStore = useMealPlanStore()
const toast = useToast()

const drawerOpen = ref(false)
const drawerRecipeId = ref<string | null>(null)
const drawerDraftRecipe = ref<DraftRecipeData | null>(null)
const convertingTitle = ref<string | null>(null)

function openRecipeDrawer(recipeId: string) {
  drawerDraftRecipe.value = null
  drawerRecipeId.value = recipeId
  drawerOpen.value = true
}

function openDraftDrawer(draft: DraftRecipeData) {
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
  const recipe = resultData?.['recipe'] as DraftRecipeData | undefined
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
const actionError = ref<string | null>(null)

const todayStr = new Date().toISOString().slice(0, 10)

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const fromDate = ref(addDays(todayStr, -2))
const toDate = ref(addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7))

const planDateRangeLabel = computed(() => formatDateRange(fromDate.value, toDate.value))

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

const occupied = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const e of timelineStore.entries) {
    const key = `${e.date}|${e.meal_type}`
    map[key] = (map[key] ?? 0) + 1
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

async function handleRegenerate(steerPrompt?: string) {
  await planStore.generateSuggestions(steerPrompt, undefined)
}

async function handleRemoveFromShortlist(id: string) {
  await shortlistStore.removeEntry(id)
}

// Entry actions wired from EntryActionsMenu via MealSlot/MealPlanGrid:

function entryLabel(entry: TimelineEntry): string {
  if (entry.entry_type === 'recipe' && entry.recipe_id) {
    return recipeTitles.value[entry.recipe_id] ?? 'Recipe'
  }
  return entry.note ?? 'Item'
}

function payloadForCopy(entry: TimelineEntry, date: string, mealType: string): TimelineEntryCreate {
  const position = timelineStore.entriesFor(date, mealType).length
  if (entry.entry_type === 'recipe' && entry.recipe_id) {
    return {
      date,
      meal_type: mealType,
      recipe_id: entry.recipe_id,
      entry_type: 'recipe',
      source: 'manual',
      position,
    }
  }
  if (entry.entry_type === 'suggestion') {
    return {
      date,
      meal_type: mealType,
      note: entry.note ?? '',
      entry_type: 'suggestion',
      source: 'manual',
      position,
    }
  }
  return {
    date,
    meal_type: mealType,
    note: entry.note ?? '',
    entry_type: 'freetext',
    source: 'manual',
    position,
  }
}

async function handleRemoveEntry(entry: TimelineEntry) {
  actionError.value = null
  try {
    await timelineStore.removeEntry(entry.id)
    toast.show({
      message: `Removed "${entryLabel(entry)}" from plan`,
    })
  } catch {
    actionError.value = 'Failed to remove entry.'
  }
}

async function handleSaveToShortlist(entry: TimelineEntry) {
  actionError.value = null
  const payload = entry.recipe_id
    ? { recipe_id: entry.recipe_id, entry_type: 'recipe' as const, note: entry.note ?? entryLabel(entry) }
    : { recipe_id: null, entry_type: 'suggestion' as const, note: entry.note ?? '' }
  try {
    const created = await shortlistStore.addEntry(payload)
    toast.show({
      message: `Saved "${entryLabel(entry)}" to shortlist`,
      undoLabel: 'Undo',
      onUndo: async () => {
        try {
          await shortlistStore.removeEntry(created.id)
        } catch {
          /* swallow */
        }
      },
    })
  } catch {
    actionError.value = 'Failed to save to shortlist.'
  }
}

async function handleMoveToShortlist(entry: TimelineEntry) {
  actionError.value = null
  const payload = entry.recipe_id
    ? { recipe_id: entry.recipe_id, entry_type: 'recipe' as const, note: entry.note ?? entryLabel(entry) }
    : { recipe_id: null, entry_type: 'suggestion' as const, note: entry.note ?? '' }
  try {
    const created = await shortlistStore.addEntry(payload)
    try {
      await timelineStore.removeEntry(entry.id)
    } catch {
      actionError.value = 'Saved to shortlist but failed to remove from plan.'
      return
    }
    toast.show({
      message: `Moved "${entryLabel(entry)}" to shortlist`,
      undoLabel: 'Undo',
      onUndo: async () => {
        try {
          await shortlistStore.removeEntry(created.id)
          await timelineStore.addEntry(payloadForCopy(entry, entry.date, entry.meal_type))
        } catch {
          /* swallow */
        }
      },
    })
  } catch {
    actionError.value = 'Failed to move to shortlist.'
  }
}

// Move-to-slot: open the DayMealPicker in a sheet.
const moveSheetOpen = ref(false)
const movingEntry = ref<TimelineEntry | null>(null)

function handleMoveToSlot(entry: TimelineEntry) {
  movingEntry.value = entry
  moveSheetOpen.value = true
}

function closeMoveSheet() {
  moveSheetOpen.value = false
  movingEntry.value = null
}

async function confirmMoveToSlot(date: string, mealType: string) {
  const entry = movingEntry.value
  if (!entry) return
  if (date === entry.date && mealType === entry.meal_type) {
    closeMoveSheet()
    return
  }
  actionError.value = null
  const payload = payloadForCopy(entry, date, mealType)
  try {
    const created = await timelineStore.addEntry(payload)
    try {
      await timelineStore.removeEntry(entry.id)
    } catch {
      actionError.value = 'Created new entry but failed to remove old one.'
      closeMoveSheet()
      return
    }
    closeMoveSheet()
    toast.show({
      message: `Moved "${entryLabel(entry)}" to ${date} ${mealType}`,
      undoLabel: 'Undo',
      onUndo: async () => {
        try {
          await timelineStore.removeEntry(created.id)
          await timelineStore.addEntry(payloadForCopy(entry, entry.date, entry.meal_type))
        } catch {
          /* swallow */
        }
      },
    })
  } catch {
    actionError.value = 'Failed to move entry.'
    closeMoveSheet()
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
    <p v-if="actionError" class="convert-error">{{ actionError }}</p>

    <details class="sources-collapsible" open>
      <summary class="sources-toggle">Suggestions &amp; shortlist</summary>
      <div class="sources-row">
        <MealSuggestionPanel
          :suggestions="planStore.suggestions"
          :loading="planStore.suggestionLoading"
          :converting-title="convertingTitle"
          :error="planStore.suggestionError"
          @regenerate="handleRegenerate"
          @convert-to-recipe="handleConvertToRecipe"
          @open-recipe="openRecipeDrawer"
        />
        <ShortlistPanel
          :entries="shortlistStore.entries"
          @remove="handleRemoveFromShortlist"
        />
      </div>
    </details>

    <div class="grid-section">
      <div class="grid-header">
        <div class="grid-heading">
          <span class="grid-title">Meal Plan</span>
          <span class="grid-date-range">{{ planDateRangeLabel }}</span>
        </div>
        <BaseButton
          variant="primary"
          :loading="planStore.suggestionLoading"
          @click="handleRegenerate()"
        >
          Generate plan
        </BaseButton>
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
        @open-recipe="openRecipeDrawer"
        @move-to-slot="handleMoveToSlot"
        @move-to-shortlist="handleMoveToShortlist"
        @save-to-shortlist="handleSaveToShortlist"
        @remove="handleRemoveEntry"
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

    <BottomSheet
      v-if="moveSheetOpen"
      title="Move to another slot"
      testid="move-to-slot-sheet"
      @close="closeMoveSheet"
    >
      <DayMealPicker
        :from-date="fromDate"
        :to-date="toDate"
        :meal-types="mealTypes"
        :today-str="todayStr"
        :occupied="occupied"
        :initial-date="movingEntry?.date"
        :initial-meal-type="movingEntry?.meal_type"
        @select="confirmMoveToSlot"
        @cancel="closeMoveSheet"
      />
    </BottomSheet>
  </div>
</template>

<style scoped>
.timeline-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
}
.sources-collapsible {
  margin-bottom: 1rem;
}
.sources-toggle {
  display: none;
  cursor: pointer;
  list-style: none;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  padding: var(--space-2) 0;
}
.sources-toggle::-webkit-details-marker {
  display: none;
}
.sources-toggle::before {
  content: '▸';
  display: inline-block;
  margin-right: var(--space-2);
  transition: transform 0.15s ease;
}
.sources-collapsible[open] > .sources-toggle::before {
  transform: rotate(90deg);
}
.sources-row {
  display: flex;
  gap: 1rem;
}
.sources-row > :first-child {
  flex: 1;
}
.grid-section {
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
  padding: var(--space-4);
}
.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}
.grid-heading {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.grid-title { font-weight: 600; }
.grid-date-range {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.show-earlier-btn {
  display: block;
  width: 100%;
  padding: var(--space-2);
  margin-bottom: var(--space-2);
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  cursor: pointer;
}
.show-earlier-btn:hover { background: var(--color-surface); color: var(--color-text); }
.show-later-btn {
  display: block;
  width: 100%;
  padding: var(--space-2);
  margin-top: var(--space-2);
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  cursor: pointer;
}
.show-later-btn:hover { background: var(--color-surface); color: var(--color-text); }
.convert-error {
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
@media (max-width: 767px) {
  .sources-toggle { display: block; }
  .sources-row { flex-direction: column; }
}
</style>
