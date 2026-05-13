<script setup lang="ts">
import { computed } from 'vue'
import MealSlot from './MealSlot.vue'
import type { TimelineEntry } from '@/types/timeline'

const props = defineProps<{
  fromDate: string       // YYYY-MM-DD
  toDate: string         // YYYY-MM-DD
  mealTypes: string[]    // from user preferences
  entries: TimelineEntry[]
  recipeTitles: Record<string, string>
  todayStr: string       // YYYY-MM-DD — for greying past rows
}>()

const emit = defineEmits<{
  (e: 'save-text', date: string, mealType: string, text: string): void
  (e: 'clear-entry', entryId: string): void
  (e: 'drop-item', item: unknown, date: string, mealType: string): void
  (e: 'drag-start', item: unknown): void
}>()

const days = computed(() => {
  const result: string[] = []
  const end = new Date(props.toDate)
  for (let d = new Date(props.fromDate); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
})

function isPast(dateStr: string): boolean {
  return dateStr < props.todayStr
}

function entryFor(date: string, mealType: string): TimelineEntry | null {
  return props.entries.find((e) => e.date === date && e.meal_type === mealType) ?? null
}

function recipeTitleFor(entry: TimelineEntry | null): string | undefined {
  if (!entry?.recipe_id) return undefined
  return props.recipeTitles[entry.recipe_id]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
</script>

<template>
  <div class="plan-grid">
    <!-- Header row -->
    <div class="header-row">
      <div class="day-label-cell"></div>
      <div v-for="mt in mealTypes" :key="mt" class="meal-type-header">
        {{ mt }}
      </div>
    </div>

    <!-- Day rows -->
    <div
      v-for="day in days"
      :key="day"
      class="day-row"
      :class="{ 'day-row--past': isPast(day), 'day-row--today': day === todayStr }"
    >
      <div class="day-label">{{ dayLabel(day) }}</div>
      <MealSlot
        v-for="mealType in mealTypes"
        :key="mealType"
        :entry="entryFor(day, mealType)"
        :meal-type="mealType"
        :recipe-title="recipeTitleFor(entryFor(day, mealType))"
        :disabled="isPast(day)"
        @save-text="(text) => emit('save-text', day, mealType, text)"
        @clear="() => { const e = entryFor(day, mealType); if (e) emit('clear-entry', e.id) }"
        @drop-item="(item) => emit('drop-item', item, day, mealType)"
        @drag-start="(item) => emit('drag-start', item)"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.header-row {
  display: flex;
  gap: 0.4rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #e5e7eb;
}
.day-label-cell {
  width: 5rem;
  flex-shrink: 0;
}
.meal-type-header {
  flex: 1;
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #6b7280;
  letter-spacing: 0.05em;
}
.day-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}
.day-row--past {
  opacity: 0.4;
  pointer-events: none;
}
.day-row--today .day-label {
  font-weight: 700;
  color: #2563eb;
}
.day-label {
  width: 5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
