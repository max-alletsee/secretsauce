<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import MealSuggestionPanel from '@/components/MealSuggestionPanel.vue'
import ShortlistPanel from '@/components/ShortlistPanel.vue'
import MealPlanGrid from '@/components/MealPlanGrid.vue'

const route = useRoute()
const router = useRouter()
const planStore = useMealPlanStore()
const shortlistStore = useShortlistStore()
const recipeStore = useRecipeStore()

const planId = route.params.id as string

onMounted(async () => {
  await Promise.all([
    planStore.fetchPlan(planId),
    shortlistStore.fetchShortlist(),
    recipeStore.fetchRecipes(),
  ])
})

// Build recipe title lookup from the recipe store
const recipeTitles = computed(() => {
  const map: Record<string, string> = {}
  for (const recipe of recipeStore.recipes) {
    if (recipe.current_version?.title) {
      map[recipe.id] = recipe.current_version.title
    }
  }
  return map
})

async function handleSaveText(date: string, mealType: string, text: string) {
  await planStore.addEntry(planId, {
    date,
    meal_type: mealType,
    note: text,
    entry_type: 'freetext',
  })
}

async function handleClearEntry(entryId: string) {
  await planStore.removeEntry(planId, entryId)
}

async function handleRegenerate(steerPrompt?: string) {
  await planStore.generateSuggestions(steerPrompt, planId)
}

async function handleRemoveFromShortlist(id: string) {
  await shortlistStore.removeEntry(id)
}

async function handleConfirm() {
  await planStore.confirmPlan(planId)
}
</script>

<template>
  <div class="detail-view">
    <div v-if="planStore.loading" class="loading">Loading…</div>

    <template v-else-if="planStore.currentPlan">
      <!-- Sources: suggestions + shortlist -->
      <div class="sources-row">
        <MealSuggestionPanel
          :suggestions="planStore.suggestions"
          :loading="planStore.suggestionLoading"
          @regenerate="handleRegenerate"
        />
        <ShortlistPanel
          :entries="shortlistStore.entries"
          @remove="handleRemoveFromShortlist"
        />
      </div>

      <!-- Plan grid -->
      <div class="plan-section">
        <div class="plan-section-header">
          <span class="plan-title">
            {{ planStore.currentPlan.name }}
            <span class="date-range">
              {{ planStore.currentPlan.start_date }} – {{ planStore.currentPlan.end_date }}
            </span>
          </span>
          <div class="plan-actions">
            <button
              v-if="planStore.currentPlan.status === 'active'"
              class="btn-log"
              @click="router.push({ name: 'meal-plan-log', params: { id: planId } })"
            >
              📋 Log meals
            </button>
            <button
              v-if="planStore.currentPlan.status === 'draft'"
              class="btn-confirm"
              @click="handleConfirm"
            >
              ✓ Confirm Plan
            </button>
          </div>
        </div>

        <MealPlanGrid
          :plan="planStore.currentPlan"
          :recipe-titles="recipeTitles"
          @save-text="handleSaveText"
          @clear-entry="handleClearEntry"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
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
.plan-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}
.plan-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.plan-title {
  font-weight: 600;
}
.date-range {
  font-size: 0.8rem;
  color: #888;
  margin-left: 0.5rem;
  font-weight: 400;
}
.plan-actions {
  display: flex;
  gap: 0.5rem;
}
.btn-confirm {
  background: #2ecc71;
  color: #111;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
  font-weight: 600;
}
.btn-log {
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
}
.loading {
  text-align: center;
  color: #888;
  padding: 2rem;
}

@media (max-width: 767px) {
  .sources-row {
    flex-direction: column;
  }
}
</style>
