<!-- frontend/src/components/RecipeForm.vue -->
<script setup lang="ts">
import { ref, computed, watchEffect, toRaw } from 'vue'
import type { Ingredient, Step, RecipeCreatePayload } from '@/types/recipe'
import TagSelector from './TagSelector.vue'
import IngredientDrawer from './IngredientDrawer.vue'
import StepDrawer from './StepDrawer.vue'
import BaseButton from './base/BaseButton.vue'
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
  // toRaw() first: props are reactive-proxied by Vue, and structuredClone()
  // cannot clone a Proxy — only the plain array/objects it wraps.
  ingredients.value = d.ingredients ? structuredClone(toRaw(d.ingredients)) : []
  steps.value = d.steps ? structuredClone(toRaw(d.steps)) : []
  tags.value = d.tags ? [...d.tags] : []
  visibility.value = d.visibility ?? 'private'
})

const isTitleValid = computed(() => title.value.trim().length > 0)
const isIngredientsValid = computed(() => ingredients.value.length > 0)
const isStepsValid = computed(() => steps.value.length > 0)

const isValid = computed(
  () => isTitleValid.value && isIngredientsValid.value && isStepsValid.value,
)

// Hints stay hidden until the user has tried to save at least once, so an
// empty form isn't scolding them before they've had a chance to fill it in.
const submitAttempted = ref(false)

const showTitleHint = computed(() => submitAttempted.value && !isTitleValid.value)
const showIngredientsHint = computed(() => submitAttempted.value && !isIngredientsValid.value)
const showStepsHint = computed(() => submitAttempted.value && !isStepsValid.value)

// Ingredient drawer state
const showIngredientDrawer = ref(false)
const editingIngredientIndex = ref<number | null>(null)
const editingIngredient = computed(() =>
  editingIngredientIndex.value !== null
    ? (ingredients.value[editingIngredientIndex.value] ?? null)
    : null,
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
  editingStepIndex.value !== null ? (steps.value[editingStepIndex.value] ?? null) : null,
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
  submitAttempted.value = true
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
      <input
        id="recipe-title"
        v-model="title"
        type="text"
        required
        :aria-invalid="showTitleHint ? 'true' : undefined"
        :aria-describedby="showTitleHint ? 'recipe-title-hint' : undefined"
      />
      <p v-if="showTitleHint" id="recipe-title-hint" class="recipe-form__hint" data-testid="title-hint" role="alert">
        Title is required.
      </p>
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
      <p v-if="showIngredientsHint" class="recipe-form__hint" data-testid="ingredients-hint" role="alert">
        Add at least one ingredient.
      </p>
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
      <p v-if="showStepsHint" class="recipe-form__hint" data-testid="steps-hint" role="alert">
        Add at least one step.
      </p>
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
      <BaseButton type="submit" variant="primary" :disabled="!isValid">
        {{ submitLabel }}
      </BaseButton>
      <BaseButton type="button" variant="secondary" @click="emit('cancel')">Cancel</BaseButton>
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
  gap: var(--space-4);
  max-width: 640px;
  /* Reserve room so content isn't hidden behind the sticky actions bar. */
  padding-bottom: calc(var(--space-8) + var(--space-4));
}
.recipe-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.recipe-form__row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}
@media (min-width: 768px) {
  .recipe-form__row {
    grid-template-columns: repeat(4, 1fr);
  }
}
label {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
}
input, textarea, select {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input:focus-visible, textarea:focus-visible, select:focus-visible {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}
input[aria-invalid='true'] {
  border-color: var(--color-danger);
}
.recipe-form__hint {
  color: var(--color-danger);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  margin: 0;
}
.recipe-form__section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-4);
  margin: 0;
}
.recipe-form__section legend {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  font-weight: 600;
  padding: 0 var(--space-1);
  color: var(--color-text);
}
.recipe-form__list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-2);
}
.recipe-form__list--numbered {
  list-style: decimal inside;
}
.recipe-form__list-item {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  font-size: var(--text-base);
}
.recipe-form__list-item:hover {
  background: var(--color-surface-2);
}
.recipe-form__empty {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin: 0 0 var(--space-2);
}
.recipe-form__add-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  cursor: pointer;
  padding: var(--space-1) 0;
}
.recipe-form__toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  width: fit-content;
}
.recipe-form__toggle-btn {
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  color: var(--color-text);
  border: none;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  cursor: pointer;
}
.recipe-form__toggle-btn.active {
  background: var(--color-primary);
  color: var(--color-primary-ink);
}
.recipe-form__actions {
  /* Sticky bottom save bar: stays reachable while scrolling a long form.
     Matches the sticky-bar pattern used elsewhere (e.g. RecipeDetailView's
     sticky meta bar), mirrored to the bottom edge. */
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  gap: var(--space-3);
  margin: 0 calc(var(--space-4) * -1) calc(var(--space-4) * -1);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.recipe-form__actions :deep(.btn) {
  flex: 1;
}
@media (min-width: 768px) {
  .recipe-form__actions :deep(.btn) {
    flex: 0 0 auto;
  }
}
</style>
