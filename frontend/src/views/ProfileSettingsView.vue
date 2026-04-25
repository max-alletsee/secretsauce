<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/useUserStore'

const userStore = useUserStore()

const displayName = ref('')
const preferredUnits = ref<'metric' | 'imperial'>('metric')
const defaultServings = ref(2)
const mealPlanSystemPrompt = ref('')
const mealPlanMealTypes = ref<string[]>(['dinner'])
const mealPlanDaysAhead = ref(7)

const saving = ref(false)
const saved = ref(false)
const error = ref('')

const ALL_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

function toggleMealType(mt: string) {
  if (mealPlanMealTypes.value.includes(mt)) {
    mealPlanMealTypes.value = mealPlanMealTypes.value.filter((t) => t !== mt)
  } else {
    mealPlanMealTypes.value = [...mealPlanMealTypes.value, mt]
  }
}

onMounted(() => {
  const u = userStore.user
  if (!u) return
  displayName.value = u.display_name ?? ''
  preferredUnits.value = u.preferred_units
  defaultServings.value = u.default_servings
  mealPlanSystemPrompt.value = u.meal_plan_system_prompt ?? ''
  mealPlanMealTypes.value = u.meal_plan_meal_types ?? ['dinner']
  mealPlanDaysAhead.value = u.meal_plan_days_ahead ?? 7
})

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    await userStore.updateProfile({
      display_name: displayName.value || null,
      preferred_units: preferredUnits.value,
      default_servings: defaultServings.value,
      meal_plan_system_prompt: mealPlanSystemPrompt.value || null,
      meal_plan_meal_types: mealPlanMealTypes.value,
      meal_plan_days_ahead: mealPlanDaysAhead.value,
    })
    saved.value = true
  } catch {
    error.value = 'Failed to save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="settings-page">
    <h1>Settings</h1>

    <section class="settings-section">
      <h2>Profile</h2>
      <label class="field-label">
        Display name
        <input v-model="displayName" type="text" class="field-input" placeholder="Your name" />
      </label>
      <label class="field-label">
        Preferred units
        <select v-model="preferredUnits" class="field-input">
          <option value="metric">Metric</option>
          <option value="imperial">Imperial</option>
        </select>
      </label>
      <label class="field-label">
        Default servings
        <input v-model.number="defaultServings" type="number" min="1" max="20" class="field-input" />
      </label>
    </section>

    <section class="settings-section">
      <h2>Meal Planning</h2>

      <div class="field-label">
        Meal types to show
        <div class="chip-row">
          <button
            v-for="mt in ALL_MEAL_TYPES"
            :key="mt"
            type="button"
            class="meal-type-chip"
            :class="{ active: mealPlanMealTypes.includes(mt) }"
            @click="toggleMealType(mt)"
          >
            {{ mt }}
          </button>
        </div>
      </div>

      <label class="field-label">
        Days ahead to plan
        <div class="slider-row">
          <input
            v-model.number="mealPlanDaysAhead"
            type="range"
            min="3"
            max="14"
            class="slider"
          />
          <span class="slider-value">{{ mealPlanDaysAhead }} days</span>
        </div>
      </label>

      <label class="field-label">
        Family context &amp; AI instructions
        <textarea
          v-model="mealPlanSystemPrompt"
          class="field-textarea"
          rows="4"
          placeholder="e.g. 2 adults, 1 toddler. We prefer low-spice meals on weekdays."
        />
      </label>
    </section>

    <div class="actions">
      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="saved" class="success-msg">Saved!</p>
      <button :disabled="saving" class="save-btn" @click="save">
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}
h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1.5rem; }
.settings-section { margin-bottom: 2rem; }
h2 { font-size: 1rem; font-weight: 600; margin: 0 0 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
.field-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.field-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.field-textarea {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  resize: vertical;
}
.chip-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }
.meal-type-chip {
  padding: 0.25rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 1rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
}
.meal-type-chip.active { background: #2563eb; color: white; border-color: #2563eb; }
.slider-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.25rem; }
.slider { flex: 1; }
.slider-value { font-size: 0.875rem; color: #6b7280; min-width: 4rem; }
.actions { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; }
.save-btn {
  padding: 0.625rem 2rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error-msg { color: #dc2626; font-size: 0.875rem; }
.success-msg { color: #16a34a; font-size: 0.875rem; }
</style>
