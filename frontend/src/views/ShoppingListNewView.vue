<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useUserStore } from '@/stores/useUserStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useImportPolling } from '@/composables/useImportPolling'
import * as shoppingApi from '@/api/shoppingLists'
import { getApiErrorDetail } from '@/api/client'
import type { TimelineEntry } from '@/types/timeline'
import PourLoader from '@/components/base/PourLoader.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import ToggleChip from '@/components/base/ToggleChip.vue'

const router = useRouter()
const timelineStore = useTimelineStore()
const userStore = useUserStore()
const recipeStore = useRecipeStore()

const recipeTitles = computed(() => {
  const map: Record<string, string> = {}
  for (const recipe of recipeStore.recipes) {
    if (recipe.current_version?.title) {
      map[recipe.id] = recipe.current_version.title
    }
  }
  return map
})

const todayStr = new Date().toISOString().slice(0, 10)
const mealTypes = computed(() => userStore.user?.meal_plan_meal_types ?? ['dinner'])

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const toDate = computed(() => addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7))

const checkedEntryIds = ref<Set<string>>(new Set())
const listName = ref('')
const generating = ref(false)
const error = ref('')

const { startPolling, status: pollingStatus, error: pollingError } = useImportPolling(
  (_recipeId, _recipeData, resultData) => {
    generating.value = false
    const listId = resultData?.shopping_list_id
    if (listId) {
      router.push(`/shopping-lists/${listId}`)
    }
  },
)

watch(pollingStatus, (s) => {
  if (s === 'failed') {
    generating.value = false
    error.value = pollingError.value ?? 'Shopping list generation failed'
  }
})

const entriesByDate = computed(() => {
  const map: Record<string, TimelineEntry[]> = {}
  for (const e of timelineStore.entries) {
    if (!map[e.date]) map[e.date] = []
    map[e.date]!.push(e)
  }
  return map
})

const days = computed(() => {
  const result: string[] = []
  const end = new Date(toDate.value)
  for (let d = new Date(todayStr); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
})

// Entries for a given day that are selectable (have a recipe attached),
// ordered by meal type so chips group predictably within the day section.
function selectableEntriesForDay(dateStr: string): TimelineEntry[] {
  const dayEntries = entriesByDate.value[dateStr] ?? []
  const result: TimelineEntry[] = []
  for (const mt of mealTypes.value) {
    for (const e of dayEntries.filter((en) => en.meal_type === mt)) {
      if (e.recipe_id) result.push(e)
    }
  }
  return result
}

function isDayChecked(dateStr: string): boolean {
  const dayEntries = selectableEntriesForDay(dateStr)
  if (dayEntries.length === 0) return false
  return dayEntries.every((e) => checkedEntryIds.value.has(e.id))
}

function isDayIndeterminate(dateStr: string): boolean {
  const dayEntries = selectableEntriesForDay(dateStr)
  const checked = dayEntries.filter((e) => checkedEntryIds.value.has(e.id))
  return checked.length > 0 && checked.length < dayEntries.length
}

function toggleDay(dateStr: string) {
  const dayEntries = selectableEntriesForDay(dateStr)
  const allChecked = isDayChecked(dateStr)
  const next = new Set(checkedEntryIds.value)
  for (const e of dayEntries) {
    if (allChecked) next.delete(e.id)
    else next.add(e.id)
  }
  checkedEntryIds.value = next
}

function toggleEntry(entryId: string) {
  const next = new Set(checkedEntryIds.value)
  if (next.has(entryId)) next.delete(entryId)
  else next.add(entryId)
  checkedEntryIds.value = next
}

function selectAllUpcoming() {
  const next = new Set(checkedEntryIds.value)
  for (const day of days.value) {
    for (const e of entriesByDate.value[day] ?? []) {
      if (e.recipe_id) next.add(e.id)
    }
  }
  checkedEntryIds.value = next
}

function clearAll() {
  checkedEntryIds.value = new Set()
}

const selectedCount = computed(() => checkedEntryIds.value.size)

const selectedRecipeCount = computed(() => {
  const recipeIds = new Set<string>()
  for (const id of checkedEntryIds.value) {
    const e = timelineStore.entries.find((en) => en.id === id)
    if (e?.recipe_id) recipeIds.add(e.recipe_id)
  }
  return recipeIds.size
})

const autoName = computed(() => {
  const checkedDates = [...checkedEntryIds.value]
    .map((id) => timelineStore.entries.find((e) => e.id === id)?.date)
    .filter(Boolean)
    .sort() as string[]
  if (checkedDates.length === 0) return 'Shopping list'
  const from = checkedDates[0]
  const to = checkedDates[checkedDates.length - 1]
  return from === to ? `Shopping list ${from}` : `Shopping list ${from} – ${to}`
})

onMounted(async () => {
  await Promise.all([
    timelineStore.fetchEntries(todayStr, toDate.value),
    recipeStore.fetchRecipes(),
  ])
  selectAllUpcoming()
  listName.value = autoName.value
})

async function generate() {
  if (checkedEntryIds.value.size === 0) return
  generating.value = true
  error.value = ''
  try {
    const { data } = await shoppingApi.generateShoppingList(
      [...checkedEntryIds.value],
      listName.value || autoName.value,
    )
    startPolling(data.task_id)
  } catch (err) {
    error.value = getApiErrorDetail(err) ?? 'Failed to start. Please try again.'
    generating.value = false
  }
}

// Mirrors TimelineView/MealSlot: recipe entries resolve their title from the
// recipe store — never fall back to the raw recipe_id, which renders as a UUID.
function entryLabel(entry: TimelineEntry): string {
  if (entry.recipe_id) {
    return recipeTitles.value[entry.recipe_id] ?? 'Recipe'
  }
  return entry.note ?? '(empty)'
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${dateStr}`
}

function dayToggleLabel(dateStr: string): string {
  return isDayChecked(dateStr) ? 'Clear day' : 'Select day'
}
</script>

<template>
  <main class="new-list-page">
    <h1>New Shopping List</h1>

    <!-- Day sections, grouped in a surface like TimelineView's .grid-section -->
    <div class="grid-section">
      <div class="grid-header">
        <div class="grid-heading">
          <span class="grid-title">Select meals</span>
          <span class="grid-date-range">{{ selectedCount }} meals selected</span>
        </div>
        <div class="toolbar-actions">
          <BaseButton variant="secondary" @click="selectAllUpcoming">Select all upcoming</BaseButton>
          <BaseButton variant="ghost" @click="clearAll">Clear</BaseButton>
        </div>
      </div>

      <div v-if="timelineStore.loading" class="loading-state"><PourLoader label="Loading meals" /></div>
      <div v-else class="day-list">
        <section
          v-for="day in days"
          :key="day"
          class="day-section"
          :class="{ 'day-section--today': day === todayStr }"
        >
          <header class="day-header">
            <h2 class="day-heading">{{ dayLabel(day) }}</h2>
            <button
              v-if="selectableEntriesForDay(day).length > 0"
              type="button"
              class="day-toggle"
              :class="{ 'day-toggle--indeterminate': isDayIndeterminate(day) }"
              :aria-pressed="isDayChecked(day)"
              @click="toggleDay(day)"
            >
              {{ dayToggleLabel(day) }}
            </button>
          </header>

          <div v-if="selectableEntriesForDay(day).length > 0" class="chip-row">
            <ToggleChip
              v-for="entry in selectableEntriesForDay(day)"
              :key="entry.id"
              :model-value="checkedEntryIds.has(entry.id)"
              @update:model-value="toggleEntry(entry.id)"
            >
              <span class="chip-meal-type">{{ entry.meal_type }}</span>
              <span class="chip-label">{{ entryLabel(entry) }}</span>
            </ToggleChip>
          </div>
          <p v-else class="day-empty">No meals planned</p>
        </section>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <span class="footer-summary">
        {{ selectedCount }} meals · {{ selectedRecipeCount }} recipes with ingredients
      </span>
      <div class="footer-actions">
        <input v-model="listName" :placeholder="autoName" class="name-input" type="text" />
        <BaseButton
          variant="primary"
          :disabled="selectedCount === 0"
          :loading="generating"
          @click="generate"
        >
          Generate shopping list →
        </BaseButton>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </main>
</template>

<style scoped>
.new-list-page {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-4);
  padding-bottom: calc(var(--space-8) * 2);
}

h1 {
  font-size: var(--text-2xl);
  font-weight: 600;
  margin: 0 0 var(--space-4);
}

/* Mirrors TimelineView's .grid-section/.grid-header so the two planning
   surfaces read as the same component family. */
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

.grid-title {
  font-weight: 600;
}

.grid-date-range {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.toolbar-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.loading-state {
  padding: var(--space-6);
  text-align: center;
}

.day-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.day-section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  background: var(--color-surface);
}

.day-section--today {
  background: var(--color-accent-soft);
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.day-heading {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.day-toggle {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-primary);
  background: transparent;
  border: none;
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.day-toggle:hover {
  background: var(--color-primary-soft);
}

/* Pressed + focus states matched to ToggleChip/.clear-checked-button, which
   were the only controls here that had them. */
.day-toggle[aria-pressed='true'] {
  background: var(--color-primary);
  color: var(--color-primary-ink);
}

.day-toggle[aria-pressed='true']:hover {
  filter: brightness(0.92);
  background: var(--color-primary);
}

.day-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.day-toggle--indeterminate {
  color: var(--color-text-muted);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip-meal-type {
  font-weight: 700;
  text-transform: capitalize;
  margin-right: var(--space-1);
}

.chip-label {
  font-weight: 500;
}

.day-empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
  margin: 0;
}

.footer {
  position: sticky;
  bottom: 0;
  margin-top: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.footer-summary {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.footer-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.name-input {
  flex: 1;
  min-width: 200px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  background: var(--color-surface);
  color: var(--color-text);
}

.error {
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin: 0;
}

@media (min-width: 768px) {
  .new-list-page {
    padding: var(--space-5);
  }

  .footer-actions {
    flex-wrap: nowrap;
  }
}
</style>
