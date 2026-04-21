<!-- frontend/src/components/RecipeForm.vue -->
<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import type { Ingredient, Step, RecipeCreatePayload } from '@/types/recipe'
import TagSelector from './TagSelector.vue'
import IngredientDrawer from './IngredientDrawer.vue'
import StepDrawer from './StepDrawer.vue'
import { formatIngredient } from '@/composables/useFormatIngredient'

const props = withDefaults(
  defineProps<{
    initialData?: Partial<RecipeCreatePayload>
    submitLabel?: string
  }>(),
  { submitLabel: 'Save' },
)

const emit = defineEmits<{
  submit: [data: RecipeCreatePayload]
  cancel: []
}>()

const title = ref('')
const description = ref('')
const servings = ref(2)
const prepTime = ref<number | undefined>(undefined)
const waitingTime = ref<number | undefined>(undefined)
const cookTime = ref<number | undefined>(undefined)
const ingredients = ref<Ingredient[]>([])
const steps = ref<Step[]>([])
const tags = ref<string[]>([])
const visibility = ref<'private' | 'shared'>('private')

watchEffect(() => {
  const d = props.initialData
  if (!d) return
  title.value = d.title ?? ''
  description.value = d.description ?? ''
  servings.value = d.servings ?? 2
  prepTime.value = d.prep_time_minutes ?? undefined
  waitingTime.value = d.waiting_time_minutes ?? undefined
  cookTime.value = d.cook_time_minutes ?? undefined
  ingredients.value = d.ingredients ? structuredClone(d.ingredients) : []
  steps.value = d.steps ? structuredClone(d.steps) : []
  tags.value = d.tags ? [...d.tags] : []
  visibility.value = d.visibility ?? 'private'
})

const isValid = computed(
  () => title.value.trim().length > 0 && ingredients.value.length > 0 && steps.value.length > 0,
)

// Ingredient drawer state
const showIngredientDrawer = ref(false)
const editingIngredientIndex = ref<number | null>(null)
const editingIngredient = computed(() =>
  editingIngredientIndex.value !== null ? ingredients.value[editingIngredientIndex.value] : null,
)

function openIngredientDrawer(index: number | null) {
  editingIngredientIndex.value = index
  showIngredientDrawer.value = true
}

function saveIngredient(ing: Ingredient) {
  if (editingIngredientIndex.value !== null) {
    ingredients.value[editingIngredientIndex.value] = ing
  } else {
    ingredients.value.push(ing)
  }
  showIngredientDrawer.value = false
}

function deleteIngredient() {
  if (editingIngredientIndex.value !== null) {
    ingredients.value.splice(editingIngredientIndex.value, 1)
  }
  showIngredientDrawer.value = false
}

// Step drawer state
const showStepDrawer = ref(false)
const editingStepIndex = ref<number | null>(null)
const editingStep = computed(() =>
  editingStepIndex.value !== null ? steps.value[editingStepIndex.value] : null,
)
const editingStepNumber = computed(() =>
  editingStepIndex.value !== null ? editingStepIndex.value + 1 : steps.value.length + 1,
)

function openStepDrawer(index: number | null) {
  editingStepIndex.value = index
  showStepDrawer.value = true
}

function saveStep(step: Step) {
  if (editingStepIndex.value !== null) {
    steps.value[editingStepIndex.value] = step
  } else {
    steps.value.push(step)
  }
  // Re-number all steps after save
  steps.value.forEach((s, i) => (s.order = i + 1))
  showStepDrawer.value = false
}

function deleteStep() {
  if (editingStepIndex.value !== null) {
    steps.value.splice(editingStepIndex.value, 1)
    steps.value.forEach((s, i) => (s.order = i + 1))
  }
  showStepDrawer.value = false
}

function submit() {
  if (!isValid.value) return
  emit('submit', {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    servings: servings.value,
    prep_time_minutes: prepTime.value ?? null,
    waiting_time_minutes: waitingTime.value ?? null,
    cook_time_minutes: cookTime.value ?? null,
    ingredients: ingredients.value,
    steps: steps.value,
    tags: tags.value,
    visibility: visibility.value,
  })
}

</script>

<template>
  <form class="recipe-form" @submit.prevent="submit" novalidate>
    <div class="recipe-form__field">
      <label for="recipe-title">Title</label>
      <input id="recipe-title" v-model="title" type="text" required />
    </div>

    <div class="recipe-form__field">
      <label for="rf-desc">Description</label>
      <textarea id="rf-desc" v-model="description" rows="2"></textarea>
    </div>

    <div class="recipe-form__row">
      <div class="recipe-form__field">
        <label for="rf-servings">Servings</label>
        <input id="rf-servings" v-model.number="servings" type="number" min="1" />
      </div>
      <div class="recipe-form__field">
        <label for="rf-prep">Prep (min)</label>
        <input id="rf-prep" v-model.number="prepTime" type="number" min="0" />
      </div>
      <div class="recipe-form__field">
        <label for="rf-wait">Wait (min)</label>
        <input id="rf-wait" v-model.number="waitingTime" type="number" min="0" />
      </div>
      <div class="recipe-form__field">
        <label for="rf-cook">Cook (min)</label>
        <input id="rf-cook" v-model.number="cookTime" type="number" min="0" />
      </div>
    </div>

    <!-- Ingredients -->
    <fieldset class="recipe-form__section">
      <legend>Ingredients</legend>
      <ul v-if="ingredients.length" class="recipe-form__list">
        <li
          v-for="(ing, i) in ingredients"
          :key="i"
          class="recipe-form__list-item"
          @click="openIngredientDrawer(i)"
        >
          {{ formatIngredient(ing) }}
        </li>
      </ul>
      <p v-else class="recipe-form__empty">No ingredients yet.</p>
      <button type="button" class="recipe-form__add-btn" @click="openIngredientDrawer(null)">
        + Add ingredient
      </button>
    </fieldset>

    <!-- Steps -->
    <fieldset class="recipe-form__section">
      <legend>Steps</legend>
      <ol v-if="steps.length" class="recipe-form__list recipe-form__list--numbered">
        <li
          v-for="(step, i) in steps"
          :key="i"
          class="recipe-form__list-item"
          @click="openStepDrawer(i)"
        >
          Step {{ i + 1 }}: {{ step.instruction.length > 60 ? step.instruction.slice(0, 60) + '…' : step.instruction }}
        </li>
      </ol>
      <p v-else class="recipe-form__empty">No steps yet.</p>
      <button type="button" class="recipe-form__add-btn" @click="openStepDrawer(null)">
        + Add step
      </button>
    </fieldset>

    <!-- Tags -->
    <fieldset class="recipe-form__section">
      <legend>Tags</legend>
      <TagSelector v-model="tags" />
    </fieldset>

    <!-- Visibility -->
    <div class="recipe-form__field">
      <label>Visibility</label>
      <div class="recipe-form__toggle">
        <button
          type="button"
          :class="['recipe-form__toggle-btn', { active: visibility === 'private' }]"
          @click="visibility = 'private'"
        >
          Private
        </button>
        <button
          type="button"
          :class="['recipe-form__toggle-btn', { active: visibility === 'shared' }]"
          @click="visibility = 'shared'"
        >
          Shared
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div class="recipe-form__actions">
      <button type="submit" class="btn btn--primary" :disabled="!isValid">
        {{ submitLabel }}
      </button>
      <button type="button" class="btn btn--secondary" @click="emit('cancel')">Cancel</button>
    </div>

    <!-- Drawers -->
    <IngredientDrawer
      v-if="showIngredientDrawer"
      :ingredient="editingIngredient"
      @save="saveIngredient"
      @delete="deleteIngredient"
      @close="showIngredientDrawer = false"
    />
    <StepDrawer
      v-if="showStepDrawer"
      :step="editingStep"
      :step-number="editingStepNumber"
      @save="saveStep"
      @delete="deleteStep"
      @close="showStepDrawer = false"
    />
  </form>
</template>

<style scoped>
.recipe-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 640px;
}
.recipe-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.recipe-form__row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
@media (min-width: 768px) {
  .recipe-form__row {
    grid-template-columns: repeat(4, 1fr);
  }
}
label {
  font-size: 0.875rem;
  font-weight: 500;
}
input, textarea, select {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  width: 100%;
  box-sizing: border-box;
}
.recipe-form__section {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 0;
}
.recipe-form__section legend {
  font-size: 0.9375rem;
  font-weight: 600;
  padding: 0 0.25rem;
}
.recipe-form__list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
}
.recipe-form__list--numbered {
  list-style: decimal inside;
}
.recipe-form__list-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  font-size: 0.9375rem;
}
.recipe-form__list-item:hover {
  background: #f9fafb;
}
.recipe-form__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  margin: 0 0 0.5rem;
}
.recipe-form__add-btn {
  background: none;
  border: none;
  color: #2563eb;
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0.25rem 0;
}
.recipe-form__toggle {
  display: flex;
  gap: 0;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  overflow: hidden;
  width: fit-content;
}
.recipe-form__toggle-btn {
  padding: 0.5rem 1rem;
  background: white;
  border: none;
  font-size: 0.875rem;
  cursor: pointer;
}
.recipe-form__toggle-btn.active {
  background: #2563eb;
  color: white;
}
.recipe-form__actions {
  display: flex;
  gap: 0.75rem;
}
.btn {
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}
.btn--primary { background: #2563eb; color: white; }
.btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn--secondary { background: #f3f4f6; color: #374151; }
</style>
