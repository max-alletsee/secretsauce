<script setup lang="ts">
import { computed, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import DayMealPicker from './DayMealPicker.vue'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useUserStore } from '@/stores/useUserStore'
import { useToast } from '@/composables/useToast'
import type { AssignmentSource } from '@/types/assignment'
import type { TimelineEntryCreate, TimelineEntry } from '@/types/timeline'
import type { ShortlistEntryCreate, ShortlistEntry } from '@/types/mealPlan'

const props = defineProps<{
  source: AssignmentSource
  label?: string
}>()

const emit = defineEmits<{
  (e: 'added', date: string, mealType: string): void
  (e: 'shortlisted'): void
}>()

const timelineStore = useTimelineStore()
const shortlistStore = useShortlistStore()
const userStore = useUserStore()
const toast = useToast()

const sheetOpen = ref(false)
const error = ref<string | null>(null)

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const fromDate = computed(() => addDays(todayStr(), -2))
const toDate = computed(() => addDays(todayStr(), userStore.user?.meal_plan_days_ahead ?? 7))

const mealTypes = computed(() => userStore.user?.meal_plan_meal_types ?? ['dinner'])

const occupied = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const e of timelineStore.entries) {
    const key = `${e.date}|${e.meal_type}`
    map[key] = (map[key] ?? 0) + 1
  }
  return map
})

async function openSheet() {
  error.value = null
  if (timelineStore.entries.length === 0) {
    try {
      await timelineStore.fetchEntries(fromDate.value, toDate.value)
    } catch {
      // continue; picker will just show empty occupied map
    }
  }
  sheetOpen.value = true
}

function closeSheet() {
  sheetOpen.value = false
}

function sourceTitle(): string {
  if (props.source.kind === 'recipe') return props.source.title
  if (props.source.kind === 'suggestion') return props.source.title
  return props.source.entry.note ?? 'Item'
}

function buildPlanPayload(date: string, mealType: string): TimelineEntryCreate {
  const position = timelineStore.entriesFor(date, mealType).length
  if (props.source.kind === 'recipe') {
    return {
      date,
      meal_type: mealType,
      recipe_id: props.source.recipeId,
      entry_type: 'recipe',
      source: 'manual',
      position,
    }
  }
  if (props.source.kind === 'suggestion') {
    if (props.source.matchedRecipeId) {
      return {
        date,
        meal_type: mealType,
        recipe_id: props.source.matchedRecipeId,
        entry_type: 'recipe',
        source: 'ai_suggested',
        position,
      }
    }
    return {
      date,
      meal_type: mealType,
      note: props.source.title,
      entry_type: 'suggestion',
      source: 'ai_suggested',
      position,
    }
  }
  // shortlist
  const entry = props.source.entry
  if (entry.recipe_id) {
    return {
      date,
      meal_type: mealType,
      recipe_id: entry.recipe_id,
      entry_type: 'recipe',
      source: 'manual',
      position,
    }
  }
  return {
    date,
    meal_type: mealType,
    note: entry.note ?? '',
    entry_type: 'suggestion',
    source: 'manual',
    position,
  }
}

function buildShortlistPayload(): ShortlistEntryCreate {
  if (props.source.kind === 'recipe') {
    return { recipe_id: props.source.recipeId, entry_type: 'recipe', note: props.source.title }
  }
  if (props.source.kind === 'suggestion') {
    if (props.source.matchedRecipeId) {
      return { recipe_id: props.source.matchedRecipeId, entry_type: 'recipe', note: props.source.title }
    }
    return { recipe_id: null, entry_type: 'suggestion', note: props.source.title }
  }
  // shortlist source on shortlist target is a no-op; not invoked from this UI path
  return { recipe_id: null, entry_type: 'suggestion', note: '' }
}

function formatSlotLabel(date: string, mealType: string): string {
  const d = new Date(date)
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${DAY_NAMES[d.getDay()]} ${mealType}`
}

async function handleSelect(date: string, mealType: string) {
  const payload = buildPlanPayload(date, mealType)
  let created: TimelineEntry | null = null
  try {
    created = await timelineStore.addEntry(payload)
  } catch {
    error.value = 'Failed to add to plan.'
    return
  }
  closeSheet()
  emit('added', date, mealType)
  toast.show({
    message: `Added "${sourceTitle()}" to ${formatSlotLabel(date, mealType)}`,
    undoLabel: 'Undo',
    onUndo: async () => {
      if (created) {
        try {
          await timelineStore.removeEntry(created.id)
        } catch {
          /* swallow */
        }
      }
    },
  })
}

async function handleAddToShortlist() {
  const payload = buildShortlistPayload()
  let created: ShortlistEntry | null = null
  try {
    created = await shortlistStore.addEntry(payload)
  } catch {
    error.value = 'Failed to add to shortlist.'
    return
  }
  closeSheet()
  emit('shortlisted')
  toast.show({
    message: `Saved "${sourceTitle()}" to shortlist`,
    undoLabel: 'Undo',
    onUndo: async () => {
      if (created) {
        try {
          await shortlistStore.removeEntry(created.id)
        } catch {
          /* swallow */
        }
      }
    },
  })
}
</script>

<template>
  <button
    type="button"
    class="add-btn"
    :aria-label="props.label ?? 'Add to meal plan'"
    data-testid="add-to-plan-btn"
    @click.stop.prevent="openSheet"
  >
    <span class="add-icon" aria-hidden="true">📅+</span>
  </button>

  <BottomSheet
    v-if="sheetOpen"
    title="Add to meal plan"
    testid="add-to-plan-sheet"
    @close="closeSheet"
  >
    <p v-if="error" class="add-error">{{ error }}</p>
    <DayMealPicker
      :from-date="fromDate"
      :to-date="toDate"
      :meal-types="mealTypes"
      :today-str="todayStr()"
      :occupied="occupied"
      @select="handleSelect"
      @cancel="closeSheet"
    />
    <div v-if="props.source.kind !== 'shortlist'" class="secondary-action">
      <button
        type="button"
        class="btn-shortlist"
        data-testid="add-to-shortlist-option"
        @click="handleAddToShortlist"
      >
        ★ Add to shortlist instead
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  width: 2rem;
  height: 1.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.add-btn:hover { background: #1d4ed8; }
.add-icon { font-size: 0.75rem; }
.add-error {
  color: #dc2626;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}
.secondary-action {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
}
.btn-shortlist {
  width: 100%;
  background: #f0fff4;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 0.55rem 0.9rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn-shortlist:hover { background: #dcfce7; }
</style>
