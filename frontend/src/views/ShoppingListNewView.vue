<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useUserStore } from '@/stores/useUserStore'
import { useImportPolling } from '@/composables/useImportPolling'
import * as shoppingApi from '@/api/shoppingLists'
import type { TimelineEntry } from '@/types/timeline'

const router = useRouter()
const timelineStore = useTimelineStore()
const userStore = useUserStore()

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

const { startPolling } = useImportPolling((_recipeId, _recipeData, resultData) => {
  const listId = resultData?.shopping_list_id
  if (listId) {
    router.push(`/shopping-lists/${listId}`)
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

function isDayChecked(dateStr: string): boolean {
  const dayEntries = (entriesByDate.value[dateStr] ?? []).filter((e) => e.recipe_id)
  if (dayEntries.length === 0) return false
  return dayEntries.every((e) => checkedEntryIds.value.has(e.id))
}

function isDayIndeterminate(dateStr: string): boolean {
  const dayEntries = (entriesByDate.value[dateStr] ?? []).filter((e) => e.recipe_id)
  const checked = dayEntries.filter((e) => checkedEntryIds.value.has(e.id))
  return checked.length > 0 && checked.length < dayEntries.length
}

function toggleDay(dateStr: string) {
  const dayEntries = (entriesByDate.value[dateStr] ?? []).filter((e) => e.recipe_id)
  const allChecked = isDayChecked(dateStr)
  for (const e of dayEntries) {
    if (allChecked) {
      checkedEntryIds.value.delete(e.id)
    } else {
      checkedEntryIds.value.add(e.id)
    }
  }
}

function toggleEntry(entryId: string) {
  if (checkedEntryIds.value.has(entryId)) {
    checkedEntryIds.value.delete(entryId)
  } else {
    checkedEntryIds.value.add(entryId)
  }
}

function selectAllUpcoming() {
  for (const day of days.value) {
    for (const e of entriesByDate.value[day] ?? []) {
      if (e.recipe_id) checkedEntryIds.value.add(e.id)
    }
  }
}

function clearAll() {
  checkedEntryIds.value.clear()
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
  await timelineStore.fetchEntries(todayStr, toDate.value)
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
  } catch {
    error.value = 'Failed to start. Please try again.'
    generating.value = false
  }
}

function entryLabel(entry: TimelineEntry): string {
  return entry.note ?? entry.recipe_id ?? '(empty)'
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${dateStr}`
}

function setDayIndeterminate(el: HTMLInputElement | null, dateStr: string) {
  if (el) el.indeterminate = isDayIndeterminate(dateStr)
}
</script>

<template>
  <main class="new-list-page">
    <h1>New Shopping List</h1>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-actions">
        <button class="toolbar-btn" @click="selectAllUpcoming">Select all upcoming</button>
        <button class="toolbar-btn" @click="clearAll">Clear</button>
      </div>
      <span class="toolbar-summary">{{ selectedCount }} meals selected</span>
    </div>

    <!-- Checkboard table -->
    <div class="checkboard-wrap">
      <div v-if="timelineStore.loading" class="loading-cells">Loading meals…</div>
      <table v-else class="checkboard">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th class="col-day">Day</th>
            <th v-for="mt in mealTypes" :key="mt" class="col-meal">{{ mt }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="day in days"
            :key="day"
            :class="{ 'row-today': day === todayStr }"
          >
            <td class="col-check">
              <input
                type="checkbox"
                :ref="(el) => setDayIndeterminate(el as HTMLInputElement | null, day)"
                :checked="isDayChecked(day)"
                @change="toggleDay(day)"
              />
            </td>
            <td class="col-day">{{ dayLabel(day) }}</td>
            <td v-for="mt in mealTypes" :key="mt" class="col-meal">
              <template v-if="entriesByDate[day]?.find((e) => e.meal_type === mt)">
                <label
                  v-for="entry in entriesByDate[day].filter((e) => e.meal_type === mt)"
                  :key="entry.id"
                  class="meal-label"
                >
                  <input
                    v-if="entry.recipe_id"
                    type="checkbox"
                    :checked="checkedEntryIds.has(entry.id)"
                    @change="toggleEntry(entry.id)"
                  />
                  <span :class="{ 'no-recipe': !entry.recipe_id }">
                    {{ entryLabel(entry) }}
                  </span>
                </label>
              </template>
              <span v-else class="empty-slot">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div class="footer">
      <span class="footer-summary">
        {{ selectedCount }} meals · {{ selectedRecipeCount }} recipes with ingredients
      </span>
      <div class="footer-actions">
        <input v-model="listName" :placeholder="autoName" class="name-input" type="text" />
        <button
          :disabled="selectedCount === 0 || generating"
          class="generate-btn"
          @click="generate"
        >
          {{ generating ? 'Generating…' : 'Generate shopping list →' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </main>
</template>

<style scoped>
.new-list-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}

.toolbar-actions {
  display: flex;
  gap: 0.5rem;
}

.toolbar-btn {
  font-size: 0.75rem;
  padding: 3px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.toolbar-btn:hover {
  background: #f3f4f6;
}

.toolbar-summary {
  font-size: 0.75rem;
  color: #6b7280;
}

.checkboard-wrap {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0 0 8px 8px;
}

.loading-cells {
  padding: 2rem;
  text-align: center;
  color: #9ca3af;
  font-size: 0.875rem;
}

.checkboard {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.checkboard th {
  padding: 6px 10px;
  background: #f3f4f6;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}

.checkboard td {
  padding: 6px 10px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.col-check {
  width: 2.5rem;
  text-align: center;
}

.col-day {
  white-space: nowrap;
  font-weight: 600;
  min-width: 10rem;
}

.col-meal {
  min-width: 8rem;
}

.row-today {
  background: #fffbeb;
}

.meal-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}

.no-recipe {
  color: #9ca3af;
  font-style: italic;
}

.empty-slot {
  color: #d1d5db;
}

.footer {
  margin-top: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.footer-summary {
  font-size: 0.8rem;
  color: #6b7280;
}

.footer-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.name-input {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}

.generate-btn {
  padding: 0.5rem 1.25rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}

.generate-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #dc2626;
  font-size: 0.875rem;
  margin: 0;
}

@media (min-width: 768px) {
  .new-list-page {
    padding: 1.5rem;
  }

  .footer-actions {
    flex-wrap: nowrap;
  }
}
</style>
