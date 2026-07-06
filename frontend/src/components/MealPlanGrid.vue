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
  (e: 'open-recipe', recipeId: string): void
  (e: 'move-to-slot', entry: TimelineEntry): void
  (e: 'move-to-shortlist', entry: TimelineEntry): void
  (e: 'save-to-shortlist', entry: TimelineEntry): void
  (e: 'remove', entry: TimelineEntry): void
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

function entriesFor(date: string, mealType: string): TimelineEntry[] {
  return props.entries
    .filter((e) => e.date === date && e.meal_type === mealType)
    .sort((a, b) => a.position - b.position)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
</script>

<template>
  <div class="plan-grid">
    <section
      v-for="day in days"
      :key="day"
      class="day-row"
      :class="{ 'day-row--past': isPast(day), 'day-row--today': day === todayStr }"
    >
      <h3 class="day-label">{{ dayLabel(day) }}</h3>

      <div class="day-slots">
        <MealSlot
          v-for="mealType in mealTypes"
          :key="mealType"
          :entries="entriesFor(day, mealType)"
          :date="day"
          :meal-type="mealType"
          :recipe-titles="recipeTitles"
          :disabled="false"
          @open-recipe="(id) => emit('open-recipe', id)"
          @move-to-slot="(e) => emit('move-to-slot', e)"
          @move-to-shortlist="(e) => emit('move-to-shortlist', e)"
          @save-to-shortlist="(e) => emit('save-to-shortlist', e)"
          @remove="(e) => emit('remove', e)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.day-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.day-row--past .day-label,
.day-row--past .meal-slot {
  filter: grayscale(1);
}
.day-row--today .day-label {
  font-weight: 700;
  color: var(--color-primary);
}
.day-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}
.day-slots {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Side-by-side meal slots once there's enough width to avoid squeezing content */
@media (min-width: 768px) {
  .day-slots {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: stretch;
  }
}
</style>
