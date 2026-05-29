<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  fromDate: string
  toDate: string
  mealTypes: string[]
  todayStr: string
  occupied?: Record<string, number>
  initialDate?: string
  initialMealType?: string
}>()

const emit = defineEmits<{
  (e: 'select', date: string, mealType: string): void
  (e: 'cancel'): void
}>()

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

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

function occupiedCount(date: string, mealType: string): number {
  return props.occupied?.[`${date}|${mealType}`] ?? 0
}

function isFutureValid(date: string): boolean {
  return !isPast(date)
}

const smartDefault = computed<{ date: string; mealType: string } | null>(() => {
  if (props.initialDate && props.initialMealType) {
    return { date: props.initialDate, mealType: props.initialMealType }
  }
  // first empty non-past slot scanning days ascending, meal types in order
  for (const d of days.value) {
    if (isPast(d)) continue
    for (const mt of props.mealTypes) {
      if (occupiedCount(d, mt) === 0) return { date: d, mealType: mt }
    }
  }
  // otherwise first non-past slot
  for (const d of days.value) {
    if (isPast(d)) continue
    const first = props.mealTypes[0]
    if (first) return { date: d, mealType: first }
  }
  return null
})

const selectedDate = ref<string | null>(null)
const selectedMealType = ref<string | null>(null)

watch(
  smartDefault,
  (val) => {
    if (selectedDate.value === null) selectedDate.value = val?.date ?? null
    if (selectedMealType.value === null) selectedMealType.value = val?.mealType ?? null
  },
  { immediate: true },
)

function selectDay(date: string) {
  if (isPast(date)) return
  selectedDate.value = date
}

function selectMealType(mt: string) {
  selectedMealType.value = mt
}

function confirm() {
  if (!selectedDate.value || !selectedMealType.value) return
  emit('select', selectedDate.value, selectedMealType.value)
}

function cancel() {
  emit('cancel')
}
</script>

<template>
  <div class="day-meal-picker" data-testid="day-meal-picker">
    <div class="picker-section">
      <label class="picker-label">Day</label>
      <div class="day-row" role="listbox" aria-label="Select day">
        <button
          v-for="d in days"
          :key="d"
          type="button"
          class="day-chip"
          :class="{
            'day-chip--selected': d === selectedDate,
            'day-chip--past': isPast(d),
            'day-chip--today': d === todayStr,
          }"
          :disabled="isPast(d)"
          :aria-pressed="d === selectedDate"
          :data-testid="`day-chip-${d}`"
          @click="selectDay(d)"
        >
          <span class="day-chip-label">{{ dayLabel(d) }}</span>
          <span
            v-if="selectedMealType && occupiedCount(d, selectedMealType) > 0 && isFutureValid(d)"
            class="day-chip-dot"
            :data-testid="`day-chip-dot-${d}`"
            aria-label="Occupied"
          />
        </button>
      </div>
    </div>

    <div class="picker-section">
      <label class="picker-label">Meal</label>
      <div class="meal-row" role="listbox" aria-label="Select meal type">
        <button
          v-for="mt in mealTypes"
          :key="mt"
          type="button"
          class="meal-chip"
          :class="{ 'meal-chip--selected': mt === selectedMealType }"
          :aria-pressed="mt === selectedMealType"
          :data-testid="`meal-type-${mt}`"
          @click="selectMealType(mt)"
        >
          {{ mt }}
        </button>
      </div>
    </div>

    <div class="picker-actions">
      <button
        type="button"
        class="btn btn--secondary"
        data-testid="picker-cancel"
        @click="cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn btn--primary"
        data-testid="picker-confirm"
        :disabled="!selectedDate || !selectedMealType"
        @click="confirm"
      >
        Confirm
      </button>
    </div>
  </div>
</template>

<style scoped>
.day-meal-picker {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.picker-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.picker-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
}
.day-row {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}
.day-chip {
  position: relative;
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}
.day-chip:hover:not(:disabled) { background: #f3f4f6; }
.day-chip--selected {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e3a8a;
  font-weight: 600;
}
.day-chip--today { font-weight: 600; }
.day-chip--past {
  opacity: 0.4;
  cursor: not-allowed;
}
.day-chip-dot {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
}
.meal-row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.meal-chip {
  padding: 0.45rem 0.85rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  text-transform: capitalize;
}
.meal-chip:hover { background: #f3f4f6; }
.meal-chip--selected {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e3a8a;
  font-weight: 600;
}
.picker-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.5rem;
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
