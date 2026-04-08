<script setup lang="ts">
import type { MealPlan } from '@/types/mealPlan'

defineProps<{ plan: MealPlan }>()
</script>

<template>
  <div class="meal-plan-card" :data-status="plan.status">
    <div class="card-header">
      <span class="card-name">{{ plan.name }}</span>
      <span class="card-status">{{ plan.status }}</span>
    </div>
    <div class="card-dates">{{ plan.start_date }} – {{ plan.end_date }}</div>
  </div>
</template>

<style scoped>
.meal-plan-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}
.card-name {
  font-weight: 600;
}
.card-status {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0f0f0;
  text-transform: uppercase;
}
.meal-plan-card[data-status="active"] .card-status {
  background: #d4edda;
  color: #155724;
}
.meal-plan-card[data-status="completed"] .card-status {
  background: #e2e3e5;
  color: #383d41;
}
.card-dates {
  font-size: 0.85rem;
  color: #666;
}
</style>
