<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import CarryoverBanner from '@/components/CarryoverBanner.vue'
import * as mealPlansApi from '@/api/mealPlans'
import type { CarryoverMeal, LogEntry } from '@/types/mealPlan'

const route = useRoute()
const router = useRouter()
const planStore = useMealPlanStore()
const shortlistStore = useShortlistStore()

const planId = route.params.id as string
const outcomes = ref<Record<string, 'cooked' | 'not_cooked' | 'leftover'>>({})
const carryovers = ref<CarryoverMeal[]>([])
const submitting = ref(false)
const submitted = ref(false)

onMounted(async () => {
  await planStore.fetchPlan(planId)
  // default all recipe entries to 'cooked'
  for (const entry of planStore.currentPlan?.entries ?? []) {
    if (entry.recipe_id) {
      outcomes.value[entry.id] = 'cooked'
    }
  }
})

const loggableEntries = computed(() =>
  (planStore.currentPlan?.entries ?? []).filter((e) => e.recipe_id !== null)
)

async function submit() {
  submitting.value = true
  const logEntries: LogEntry[] = Object.entries(outcomes.value).map(([entry_id, outcome]) => ({
    entry_id,
    outcome,
  }))
  try {
    const { data } = await mealPlansApi.logMealPlan(planId, logEntries)
    carryovers.value = data
    submitted.value = true
    await shortlistStore.fetchShortlist()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="log-view">
    <h1>Log meals — {{ planStore.currentPlan?.name }}</h1>

    <CarryoverBanner v-if="submitted" :carryovers="carryovers" />

    <div v-if="submitted" class="done-actions">
      <p>Plan logged successfully.</p>
      <button class="btn-primary" @click="router.push({ name: 'meal-plans' })">
        Back to plans
      </button>
    </div>

    <template v-else>
      <p class="hint">Mark each meal as cooked, not cooked, or leftover.</p>

      <div class="entry-list">
        <div
          v-for="entry in loggableEntries"
          :key="entry.id"
          class="log-entry"
        >
          <div class="entry-info">
            <span class="entry-date">{{ entry.date }}</span>
            <span class="entry-meal">{{ entry.meal_type }}</span>
          </div>
          <div class="outcome-toggles" :data-testid="`outcomes-${entry.id}`">
            <label>
              <input
                v-model="outcomes[entry.id]"
                type="radio"
                :name="entry.id"
                value="cooked"
              />
              Cooked
            </label>
            <label>
              <input
                v-model="outcomes[entry.id]"
                type="radio"
                :name="entry.id"
                value="not_cooked"
              />
              Not cooked
            </label>
            <label>
              <input
                v-model="outcomes[entry.id]"
                type="radio"
                :name="entry.id"
                value="leftover"
              />
              Leftover
            </label>
          </div>
        </div>
      </div>

      <div class="log-actions">
        <button class="btn-secondary" @click="router.back()">Cancel</button>
        <button
          class="btn-primary"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitting ? 'Saving…' : 'Submit log' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.log-view {
  max-width: 700px;
  margin: 0 auto;
  padding: 1rem;
}

h1 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}

.hint {
  color: #666;
  margin-bottom: 1rem;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.log-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.entry-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.entry-date {
  font-size: 0.85rem;
  color: #888;
}

.entry-meal {
  font-weight: 600;
  text-transform: capitalize;
}

.outcome-toggles {
  display: flex;
  gap: 1rem;
  flex-shrink: 0;
  margin-left: 1rem;
}

.outcome-toggles label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}

.outcome-toggles input[type="radio"] {
  cursor: pointer;
}

.done-actions {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  text-align: center;
}

.done-actions p {
  margin-bottom: 0.75rem;
  color: #155724;
  font-weight: 600;
}

.log-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.btn-primary {
  background: #2ecc71;
  color: #111;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
}

.btn-primary:hover:not(:disabled) {
  background: #27ae60;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  font-size: 0.95rem;
}

.btn-secondary:hover {
  background: #f0f0f0;
}

@media (max-width: 767px) {
  .log-entry {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .outcome-toggles {
    margin-left: 0;
    width: 100%;
    flex-wrap: wrap;
  }

  .log-actions {
    flex-direction: column-reverse;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
  }
}
</style>
