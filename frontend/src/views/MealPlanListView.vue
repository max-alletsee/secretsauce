<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import MealPlanCard from '@/components/MealPlanCard.vue'

const store = useMealPlanStore()
const router = useRouter()

onMounted(() => store.fetchPlans())
</script>

<template>
  <div class="meal-plan-list-view">
    <div class="list-header">
      <h1>Meal Plans</h1>
      <button class="btn-primary" @click="router.push({ name: 'meal-plan-create' })">
        + New Plan
      </button>
    </div>

    <div v-if="store.loading" class="loading">Loading…</div>

    <div v-else-if="store.plans.length === 0" class="empty-state">
      No meal plans yet. Create your first plan!
    </div>

    <div v-else class="plan-grid">
      <MealPlanCard
        v-for="plan in store.plans"
        :key="plan.id"
        :plan="plan"
        @click="router.push({ name: 'meal-plan-detail', params: { id: plan.id } })"
      />
    </div>
  </div>
</template>

<style scoped>
.meal-plan-list-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.btn-primary {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.loading, .empty-state {
  text-align: center;
  color: #666;
  padding: 2rem;
}
</style>
