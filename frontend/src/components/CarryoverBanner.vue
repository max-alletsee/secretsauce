<script setup lang="ts">
import { useShortlistStore } from '@/stores/useShortlistStore'
import type { CarryoverMeal } from '@/types/mealPlan'

const props = defineProps<{ carryovers: CarryoverMeal[] }>()
const shortlistStore = useShortlistStore()

async function addToShortlist(carryover: CarryoverMeal) {
  await shortlistStore.addEntry({
    recipe_id: carryover.recipe_id,
    entry_type: 'recipe',
  })
}
</script>

<template>
  <div v-if="carryovers.length > 0" class="carryover-banner" data-testid="carryover-banner">
    <p class="banner-title">
      🔄 {{ carryovers.length }} meal{{ carryovers.length > 1 ? 's' : '' }} carried over
    </p>
    <ul class="carryover-list">
      <li v-for="c in carryovers" :key="c.id" class="carryover-item">
        <span class="carryover-info">
          {{ c.original_date }} · {{ c.original_meal_type }} ·
          <em>{{ c.reason === 'not_cooked' ? 'not cooked' : 'leftover' }}</em>
        </span>
        <button class="btn-add-shortlist" @click="addToShortlist(c)">
          + Shortlist
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.carryover-banner {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}
.banner-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  margin-top: 0;
}
.carryover-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.carryover-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}
.carryover-info {
  flex: 1;
}
.btn-add-shortlist {
  background: #ffc107;
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  margin-left: 0.5rem;
}
.btn-add-shortlist:hover {
  background: #ffb700;
}
.btn-add-shortlist:active {
  opacity: 0.8;
}

em {
  font-style: italic;
  color: #666;
}
</style>
