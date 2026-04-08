<script setup lang="ts">
import { computed } from 'vue'
import MealSlot from './MealSlot.vue'
import type { MealPlanEntry, MealPlanWithEntries } from '@/types/mealPlan'

const props = defineProps<{
  plan: MealPlanWithEntries
  recipeTitles: Record<string, string>  // recipe_id → title
}>()

const emit = defineEmits<{
  (e: 'save-text', date: string, mealType: string, text: string): void
  (e: 'clear-entry', entryId: string): void
  (e: 'drop-to-slot', suggestion: unknown, date: string, mealType: string): void
}>()

// Derive days array from start_date..end_date
const days = computed(() => {
  const result: string[] = []
  const start = new Date(props.plan.start_date)
  const end = new Date(props.plan.end_date)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
})

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

// Derive unique meal types from entries, preserving order
const mealTypes = computed((): MealType[] => {
  const seen = new Set<string>()
  const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
  const types = props.plan.entries.map((e) => e.meal_type).filter((t) => {
    if (seen.has(t)) return false
    seen.add(t)
    return true
  })
  // If no entries yet, default to showing 'dinner'
  if (types.length === 0) return ['dinner']
  return order.filter((t) => types.includes(t))
})

function entryFor(date: string, mealType: string): MealPlanEntry | null {
  return (
    props.plan.entries.find(
      (e) => e.date === date && e.meal_type === mealType
    ) ?? null
  )
}

function recipeTitleFor(entry: MealPlanEntry | null): string | undefined {
  if (!entry || !entry.recipe_id) return undefined
  return props.recipeTitles[entry.recipe_id]
}

const DAY_NAMES: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayName(dateStr: string): string {
  return DAY_NAMES[new Date(dateStr).getDay()] ?? ''
}
</script>

<template>
  <div class="plan-grid">
    <div v-for="day in days" :key="day" class="day-row">
      <div class="day-label">
        <span class="day-short">{{ dayName(day) }}</span>
      </div>
      <MealSlot
        v-for="mealType in mealTypes"
        :key="mealType"
        :entry="entryFor(day, mealType)"
        :meal-type="mealType"
        :recipe-title="recipeTitleFor(entryFor(day, mealType))"
        @save-text="(text) => emit('save-text', day, mealType, text)"
        @clear="() => { const e = entryFor(day, mealType); if (e) emit('clear-entry', e.id) }"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.day-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}
.day-label {
  width: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.day-short {
  font-size: 0.75rem;
  font-weight: 700;
  color: #888;
  text-transform: uppercase;
}
</style>
