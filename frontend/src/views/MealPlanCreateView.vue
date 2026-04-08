<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMealPlanStore } from '@/stores/useMealPlanStore'

const store = useMealPlanStore()
const router = useRouter()

const name = ref('')
const startDate = ref('')
const endDate = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function submit() {
  if (!name.value || !startDate.value || !endDate.value) {
    error.value = 'All fields are required'
    return
  }
  submitting.value = true
  error.value = null
  try {
    const plan = await store.createPlan({
      name: name.value,
      start_date: startDate.value,
      end_date: endDate.value,
    })
    router.push({ name: 'meal-plan-detail', params: { id: plan.id } })
  } catch {
    error.value = 'Failed to create plan. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="create-view">
    <h1>New Meal Plan</h1>
    <form class="create-form" @submit.prevent="submit">
      <div class="field">
        <label for="plan-name">Plan name</label>
        <input id="plan-name" v-model="name" type="text" placeholder="e.g. Week of Apr 7" required />
      </div>
      <div class="field">
        <label for="start-date">Start date</label>
        <input id="start-date" v-model="startDate" type="date" required />
      </div>
      <div class="field">
        <label for="end-date">End date</label>
        <input id="end-date" v-model="endDate" type="date" required />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn-secondary" @click="router.back()">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="submitting">
          {{ submitting ? 'Creating…' : 'Create Plan' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.create-view {
  max-width: 500px;
  margin: 2rem auto;
  padding: 1rem;
}
.create-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #555;
}
input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 1rem;
}
.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
.btn-primary {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-secondary {
  background: transparent;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
}
.error {
  color: #e94560;
  font-size: 0.875rem;
}
</style>
