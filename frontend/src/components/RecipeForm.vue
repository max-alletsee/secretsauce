<!-- frontend/src/components/RecipeForm.vue -->
<script setup lang="ts">
import { ref, computed, watchEffect, toRaw } from 'vue'
import type { Ingredient, Step, RecipeCreatePayload } from '@/types/recipe'
import TagSelector from './TagSelector.vue'
import IngredientDrawer from './IngredientDrawer.vue'
import StepDrawer from './StepDrawer.vue'
import BaseButton from './base/BaseButton.vue'
import DragList from './base/DragList.vue'
import { formatIngredient } from '@/composables/useFormatIngredient'

// DragList requires a stable, unique keyField per row to track identity across
// reorders. Neither Ingredient (no id field) nor Step (order is NOT stable —
// it gets renumbered on every edit/reorder) can serve as that key. So we wrap
// each item in a local-only { localId, ... } object, purely for presentation:
// localId is generated once per row (incrementing counter, scoped to this
// component instance) and never leaves this file — it's stripped back out to
// plain Ingredient/Step objects before the submit payload is built.
let nextLocalId = 0
function makeLocalId() {
  nextLocalId += 1
  return `local-${nextLocalId}`
}

interface IngredientRow {
  localId: string
  ingredient: Ingredient
}
interface StepRow {
  localId: string
  step: Step
}

const props = withDefaults(
  defineProps<{
    initialData?: Partial<RecipeCreatePayload>
    submitLabel?: string
    // True when this form is showing a freshly-imported recipe (URL/photo
    // import) that the user hasn't confirmed yet. Purely additive: when
    // false/omitted, no banner/marking/gate renders and isValid/submit
    // behave exactly as before Task 5.3.
    isImportReview?: boolean
  }>(),
  { submitLabel: 'Save', isImportReview: false },
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
// Local wrapper rows (stable localId + plain Ingredient/Step payload).
// See comment near makeLocalId() above for why these wrappers exist.
const ingredientRows = ref<IngredientRow[]>([])
const stepRows = ref<StepRow[]>([])
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
  const initialIngredients: Ingredient[] = d.ingredients
    ? structuredClone(toRaw(d.ingredients))
    : []
  const initialSteps: Step[] = d.steps ? structuredClone(toRaw(d.steps)) : []
  ingredientRows.value = initialIngredients.map((ingredient) => ({
    localId: makeLocalId(),
    ingredient,
  }))
  stepRows.value = initialSteps.map((step) => ({ localId: makeLocalId(), step }))
  tags.value = d.tags ? [...d.tags] : []
  visibility.value = d.visibility ?? 'private'
})

const isTitleValid = computed(() => title.value.trim().length > 0)
const isIngredientsValid = computed(() => ingredientRows.value.length > 0)
const isStepsValid = computed(() => stepRows.value.length > 0)

// Import-review confirm gate: only relevant when isImportReview is true.
// When false, this stays true unconditionally so it never affects isValid.
const importReviewConfirmed = ref(false)
const isImportReviewSatisfied = computed(
  () => !props.isImportReview || importReviewConfirmed.value,
)

const isValid = computed(
  () =>
    isTitleValid.value &&
    isIngredientsValid.value &&
    isStepsValid.value &&
    isImportReviewSatisfied.value,
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
    ? (ingredientRows.value[editingIngredientIndex.value]?.ingredient ?? null)
    : null,
)

function openIngredientDrawer(index: number | null) {
  editingIngredientIndex.value = index
  showIngredientDrawer.value = true
}

function saveIngredient(ing: Ingredient) {
  if (editingIngredientIndex.value !== null) {
    const row = ingredientRows.value[editingIngredientIndex.value]
    if (row) row.ingredient = ing
  } else {
    ingredientRows.value.push({ localId: makeLocalId(), ingredient: ing })
  }
  showIngredientDrawer.value = false
}

function deleteIngredient() {
  if (editingIngredientIndex.value !== null) {
    ingredientRows.value.splice(editingIngredientIndex.value, 1)
  }
  showIngredientDrawer.value = false
}

function reorderIngredients(rows: IngredientRow[]) {
  ingredientRows.value = rows
}

// Step drawer state
const showStepDrawer = ref(false)
const editingStepIndex = ref<number | null>(null)
const editingStep = computed(() =>
  editingStepIndex.value !== null ? (stepRows.value[editingStepIndex.value]?.step ?? null) : null,
)
const editingStepNumber = computed(() =>
  editingStepIndex.value !== null ? editingStepIndex.value + 1 : stepRows.value.length + 1,
)

function openStepDrawer(index: number | null) {
  editingStepIndex.value = index
  showStepDrawer.value = true
}

// Reindex every step's `order` field to match its position in the array
// (1..n). Reused for save/delete/drag-reorder so there's exactly one place
// that defines "what order means" for steps.
function reindexStepOrders() {
  stepRows.value.forEach((row, i) => (row.step.order = i + 1))
}

function saveStep(step: Step) {
  if (editingStepIndex.value !== null) {
    const row = stepRows.value[editingStepIndex.value]
    if (row) row.step = step
  } else {
    stepRows.value.push({ localId: makeLocalId(), step })
  }
  reindexStepOrders()
  showStepDrawer.value = false
}

function deleteStep() {
  if (editingStepIndex.value !== null) {
    stepRows.value.splice(editingStepIndex.value, 1)
    reindexStepOrders()
  }
  showStepDrawer.value = false
}

function reorderSteps(rows: StepRow[]) {
  stepRows.value = rows
  reindexStepOrders()
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
    ingredients: ingredientRows.value.map((row) => row.ingredient),
    steps: stepRows.value.map((row) => row.step),
    tags: tags.value,
    visibility: visibility.value,
  })
}

</script>

<template>
  <form class="recipe-form" @submit.prevent="submit" novalidate>
    <div
      v-if="isImportReview"
      class="recipe-form__import-banner"
      role="status"
      data-testid="import-review-banner"
    >
      Imported — please review
    </div>

    <div
      class="recipe-form__field"
      :class="{ 'recipe-form__field--imported': isImportReview }"
    >
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

    <div
      class="recipe-form__field"
      :class="{ 'recipe-form__field--imported': isImportReview }"
    >
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
    <fieldset
      class="recipe-form__section"
      :class="{ 'recipe-form__section--imported': isImportReview }"
    >
      <legend>Ingredients</legend>
      <DragList
        v-if="ingredientRows.length"
        class="recipe-form__drag-list"
        :items="ingredientRows"
        key-field="localId"
        @update:items="reorderIngredients"
      >
        <template #default="{ item, index }">
          <div class="recipe-form__list-item" @click="openIngredientDrawer(index)">
            {{ formatIngredient(item.ingredient) }}
          </div>
        </template>
      </DragList>
      <p v-else class="recipe-form__empty">No ingredients yet.</p>
      <p v-if="showIngredientsHint" class="recipe-form__hint" data-testid="ingredients-hint" role="alert">
        Add at least one ingredient.
      </p>
      <button type="button" class="recipe-form__add-btn" @click="openIngredientDrawer(null)">
        + Add ingredient
      </button>
    </fieldset>

    <!-- Steps -->
    <fieldset
      class="recipe-form__section"
      :class="{ 'recipe-form__section--imported': isImportReview }"
    >
      <legend>Steps</legend>
      <DragList
        v-if="stepRows.length"
        class="recipe-form__drag-list"
        :items="stepRows"
        key-field="localId"
        @update:items="reorderSteps"
      >
        <template #default="{ item, index }">
          <div class="recipe-form__list-item" @click="openStepDrawer(index)">
            Step {{ index + 1 }}:
            {{ item.step.instruction.length > 60 ? item.step.instruction.slice(0, 60) + '…' : item.step.instruction }}
          </div>
        </template>
      </DragList>
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

    <!-- Import review confirm gate -->
    <div v-if="isImportReview" class="recipe-form__confirm-review">
      <input
        id="rf-import-review-confirm"
        v-model="importReviewConfirmed"
        type="checkbox"
        data-testid="import-review-confirm"
      />
      <label for="rf-import-review-confirm">I've reviewed this imported recipe</label>
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
.recipe-form__import-banner {
  background: var(--color-accent-soft);
  color: var(--color-text);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}
.recipe-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
/* Subtle marker for fields prefilled by an import — a thin accent border
   rather than a badge, so it reads as "this came from the import" without
   competing with validation-hint styling (which uses --color-danger). */
.recipe-form__field--imported {
  border-left: 3px solid var(--color-accent);
  padding-left: var(--space-3);
}
.recipe-form__section--imported {
  border-left: 3px solid var(--color-accent);
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
.recipe-form__drag-list {
  margin-bottom: var(--space-2);
}
.recipe-form__list-item {
  padding: var(--space-2) 0;
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
.recipe-form__confirm-review {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
}
.recipe-form__confirm-review input[type='checkbox'] {
  width: auto;
  flex: none;
}
.recipe-form__confirm-review input[type='checkbox']:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.recipe-form__confirm-review label {
  cursor: pointer;
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
