<!-- frontend/src/views/RecipeDetailView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Pencil, EllipsisVertical } from '@lucide/vue'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import VersionHistoryPanel from '@/components/VersionHistoryPanel.vue'
import AddToPlanButton from '@/components/AddToPlanButton.vue'
import Stepper from '@/components/base/Stepper.vue'
import IconButton from '@/components/base/IconButton.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import { formatIngredient } from '@/composables/useFormatIngredient'
import { scaleQuantity } from '@/composables/useScaledQuantity'
import PourLoader from '@/components/base/PourLoader.vue'
import ProgressBar from '@/components/base/ProgressBar.vue'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const userStore = useUserStore()

const error = ref('')
const deleting = ref(false)
const isNotFound = ref(false)
const confirmingDelete = ref(false)
const menuOpen = ref(false)

const recipe = computed(() => recipeStore.currentRecipe)
const isOwner = computed(() => recipe.value?.owner_id === userStore.user?.id)

// Live servings scaling (presentational only — never persisted).
// `recipe` starts null until the fetch in loadRecipe() resolves, so we can't
// read the base servings at setup time. Watch for the recipe arriving and
// initialize `servings`/`baseServings` exactly once from its data.
const servings = ref<number | null>(null)
const baseServings = ref<number | null>(null)

watch(
  recipe,
  (r) => {
    if (r && baseServings.value === null) {
      baseServings.value = r.current_version.servings
      servings.value = r.current_version.servings
    }
  },
  { immediate: true },
)

const scaleFactor = computed(() => {
  if (!baseServings.value || !servings.value) return 1
  return servings.value / baseServings.value
})

const scaledIngredients = computed(() => {
  return (
    recipe.value?.current_version.ingredients.map((ing) => ({
      ...ing,
      quantity: scaleQuantity(ing.quantity, scaleFactor.value),
    })) ?? []
  )
})

// Ingredient/step checkoff — presentational only, local to this component
// instance. Never persisted (no localStorage/store/API write) and naturally
// resets on reload. Ingredients are keyed by array index (no stable id field
// on Ingredient); steps are keyed by their stable `order` field.
const checkedIngredients = ref<Set<number>>(new Set())
const checkedSteps = ref<Set<number>>(new Set())

function toggleIngredient(index: number) {
  const next = new Set(checkedIngredients.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  checkedIngredients.value = next
}

function toggleStep(order: number) {
  const next = new Set(checkedSteps.value)
  if (next.has(order)) {
    next.delete(order)
  } else {
    next.add(order)
  }
  checkedSteps.value = next
}

const doneStepsCount = computed(() => checkedSteps.value.size)
const totalStepsCount = computed(() => recipe.value?.current_version.steps.length ?? 0)
const stepsProgressLabel = computed(() => `${doneStepsCount.value} of ${totalStepsCount.value} steps`)

// The `/recipes/:id` route is a single route record, so Vue Router reuses
// this component instance when navigating between different recipe ids
// (e.g. via RouterLink from a "related recipes" list) rather than
// remounting it. Without this, checkoff state from the previous recipe
// would bleed into the next one.
watch(
  () => recipe.value?.id,
  () => {
    checkedIngredients.value = new Set()
    checkedSteps.value = new Set()
  },
)

async function loadRecipe() {
  error.value = ''
  isNotFound.value = false
  try {
    await recipeStore.fetchRecipe(route.params.id as string)
    await recipeStore.fetchVersions(route.params.id as string)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) {
      const response = (e as { response?: { status?: number } }).response
      if (response?.status === 404) {
        isNotFound.value = true
        error.value = 'Recipe not found.'
      } else {
        error.value = 'Failed to load recipe.'
      }
    } else {
      error.value = 'Failed to load recipe.'
    }
  }
}

onMounted(loadRecipe)

function goToEdit() {
  if (!recipe.value) return
  router.push(`/recipes/${recipe.value.id}/edit`)
}

const menuTriggerRef = ref<InstanceType<typeof IconButton> | null>(null)
const menuRootRef = ref<HTMLElement | null>(null)

function focusMenuTrigger() {
  ;(menuTriggerRef.value?.$el as HTMLElement | undefined)?.focus()
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function closeMenu() {
  menuOpen.value = false
}

function handleDelete() {
  closeMenu()
  confirmingDelete.value = true
}

function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && menuOpen.value) {
    closeMenu()
    focusMenuTrigger()
  }
}

function onDocumentPointerdown(e: PointerEvent) {
  if (!menuOpen.value) return
  const root = menuRootRef.value
  if (root && !root.contains(e.target as Node)) {
    closeMenu()
  }
}

watch(menuOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onDocumentKeydown)
    document.addEventListener('pointerdown', onDocumentPointerdown)
  } else {
    document.removeEventListener('keydown', onDocumentKeydown)
    document.removeEventListener('pointerdown', onDocumentPointerdown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerdown)
})

async function confirmDelete() {
  if (!recipe.value) return
  confirmingDelete.value = false
  deleting.value = true
  try {
    await recipeStore.deleteRecipe(recipe.value.id)
    router.push('/recipes')
  } catch {
    error.value = 'Failed to delete recipe.'
    deleting.value = false
  }
}

async function handleRestore(versionId: string) {
  if (!recipe.value) return
  try {
    await recipeStore.restoreVersion(recipe.value.id, versionId)
  } catch {
    error.value = 'Failed to restore version.'
  }
}

</script>

<template>
  <main class="recipe-detail">
    <div v-if="error" class="recipe-detail__error">
      <p>{{ error }}</p>
      <div class="recipe-detail__error-actions">
        <button v-if="!isNotFound" type="button" class="btn btn--secondary" @click="loadRecipe">
          Try again
        </button>
        <RouterLink to="/recipes">Back to recipes</RouterLink>
      </div>
    </div>

    <div v-else-if="recipeStore.loading && !recipe" class="recipe-detail__loading">
      <PourLoader />
    </div>

    <template v-else-if="recipe">
      <header class="recipe-detail__header">
        <h1>{{ recipe.current_version.title }}</h1>
        <div class="recipe-detail__primary-actions">
          <AddToPlanButton
            :source="{ kind: 'recipe', recipeId: recipe.id, title: recipe.current_version.title }"
            :label="`Add ${recipe.current_version.title} to meal plan`"
          />
        </div>
        <div v-if="isOwner" class="recipe-detail__owner-actions">
          <IconButton :icon="Pencil" label="Edit recipe" variant="ghost" @click="goToEdit" />

          <div ref="menuRootRef" class="recipe-detail__overflow">
            <IconButton
              ref="menuTriggerRef"
              :icon="EllipsisVertical"
              label="More actions"
              variant="ghost"
              aria-haspopup="menu"
              :aria-expanded="menuOpen ? 'true' : 'false'"
              @click="toggleMenu"
            />
            <ul v-if="menuOpen" role="menu" class="recipe-detail__overflow-list">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="delete-recipe"
                  class="recipe-detail__overflow-action"
                  :disabled="deleting"
                  @click="handleDelete"
                >
                  {{ deleting ? 'Deleting…' : 'Delete' }}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </header>

      <ConfirmDialog
        :open="confirmingDelete"
        title="Delete recipe?"
        message="This can't be undone."
        confirm-label="Yes, delete"
        danger
        @confirm="confirmDelete"
        @cancel="confirmingDelete = false"
      />

      <p v-if="recipe.current_version.description" class="recipe-detail__description">
        {{ recipe.current_version.description }}
      </p>

      <div class="recipe-detail__meta">
        <Stepper
          v-if="servings !== null"
          v-model="servings"
          :min="1"
          label="Servings"
          class="recipe-detail__servings-stepper"
        />
        <span class="recipe-detail__meta-label">servings</span>
        <span v-if="recipe.current_version.total_time_minutes">
          {{ recipe.current_version.total_time_minutes }} min total
        </span>
        <span v-if="recipe.current_version.prep_time_minutes">
          {{ recipe.current_version.prep_time_minutes }} min prep
        </span>
        <span v-if="recipe.current_version.cook_time_minutes">
          {{ recipe.current_version.cook_time_minutes }} min cook
        </span>
        <span class="recipe-detail__badge">{{ recipe.visibility }}</span>
      </div>

      <div class="recipe-detail__columns">
        <section class="recipe-detail__section">
          <h2>Ingredients</h2>
          <ul class="recipe-detail__ingredients">
            <li
              v-for="(ing, i) in scaledIngredients"
              :key="i"
              :class="{ 'is-done': checkedIngredients.has(i) }"
            >
              <label class="recipe-detail__checkoff-label">
                <input
                  type="checkbox"
                  :checked="checkedIngredients.has(i)"
                  @change="toggleIngredient(i)"
                />
                <span>{{ formatIngredient(ing) }}</span>
              </label>
            </li>
          </ul>
        </section>

        <section class="recipe-detail__section">
          <div class="recipe-detail__steps-header">
            <h2>Steps</h2>
            <ProgressBar
              :value="doneStepsCount"
              :max="totalStepsCount"
              :label="stepsProgressLabel"
              class="recipe-detail__steps-progress"
            />
          </div>
          <ol class="recipe-detail__steps">
            <li
              v-for="step in recipe.current_version.steps"
              :key="step.order"
              :class="{ 'is-done': checkedSteps.has(step.order) }"
            >
              <label class="recipe-detail__checkoff-label">
                <input
                  type="checkbox"
                  :checked="checkedSteps.has(step.order)"
                  @change="toggleStep(step.order)"
                />
                <span>{{ step.instruction }}</span>
              </label>
            </li>
          </ol>
        </section>
      </div>

      <section v-if="recipe.current_version.tags.length" class="recipe-detail__section">
        <h2>Tags</h2>
        <div class="recipe-detail__tags">
          <span v-for="tag in recipe.current_version.tags" :key="tag" class="recipe-detail__tag">
            {{ tag }}
          </span>
        </div>
      </section>

      <VersionHistoryPanel
        v-if="recipeStore.versions.length"
        :versions="recipeStore.versions"
        :current-version-number="recipe.current_version.version_number"
        @restore="handleRestore"
      />
    </template>
  </main>
</template>

<style scoped>
.recipe-detail {
  padding: var(--space-4);
  max-width: 960px;
  margin: 0 auto;
}
.recipe-detail__error {
  text-align: center;
  padding: var(--space-8) 0;
  color: var(--color-danger);
}
.recipe-detail__error a {
  display: inline-block;
  margin-top: var(--space-4);
  color: var(--color-primary);
}
.recipe-detail__error-actions {
  display: flex;
  gap: var(--space-4);
  justify-content: center;
  margin-top: var(--space-4);
  align-items: center;
}
.recipe-detail__loading {
  text-align: center;
  padding: var(--space-8) 0;
  color: var(--color-text-muted);
}
.recipe-detail__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.recipe-detail__header h1 {
  font-size: var(--text-2xl);
  font-weight: 700;
  margin: 0;
}
@media (min-width: 768px) {
  .recipe-detail__header h1 {
    font-size: var(--text-3xl);
  }
}
.recipe-detail__owner-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.recipe-detail__overflow {
  position: relative;
  display: inline-flex;
}
.recipe-detail__overflow-list {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  z-index: 200;
  min-width: 10rem;
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}
.recipe-detail__overflow-action {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-danger);
  text-decoration: none;
  white-space: nowrap;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
}
.recipe-detail__overflow-action:hover:not(:disabled) {
  background: var(--color-surface-2);
}
.recipe-detail__overflow-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.recipe-detail__primary-actions {
  display: flex;
  gap: var(--space-2);
}
.recipe-detail__description {
  color: var(--color-text-muted);
  margin: var(--space-2) 0 0;
}
.recipe-detail__meta {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  margin: var(--space-4) 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.recipe-detail__meta-label {
  margin-left: calc(var(--space-2) * -1);
}
.recipe-detail__badge {
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface-2);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  text-transform: capitalize;
}
.recipe-detail__columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
}
@media (min-width: 1024px) {
  .recipe-detail__columns {
    grid-template-columns: 1fr 1fr;
  }
}
.recipe-detail__section {
  margin: var(--space-5) 0;
}
.recipe-detail__columns .recipe-detail__section {
  margin: 0;
}
.recipe-detail__section h2 {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0 0 var(--space-3);
}
.recipe-detail__ingredients {
  list-style: none;
  padding: 0;
  margin: 0;
}
.recipe-detail__ingredients li {
  padding: var(--space-1) 0;
}
.recipe-detail__steps-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.recipe-detail__steps-header h2 {
  margin: 0;
}
.recipe-detail__steps-progress {
  max-width: 240px;
}
.recipe-detail__steps {
  list-style: none;
  padding-left: 0;
  margin: 0;
  counter-reset: recipe-detail-steps;
}
.recipe-detail__steps li {
  padding: var(--space-2) 0;
  line-height: 1.5;
  counter-increment: recipe-detail-steps;
}
.recipe-detail__steps li::before {
  content: counter(recipe-detail-steps) '. ';
  font-weight: 600;
}
.recipe-detail__checkoff-label {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  cursor: pointer;
}
.recipe-detail__checkoff-label input[type='checkbox'] {
  margin-top: 0.2em;
  flex-shrink: 0;
  cursor: pointer;
}
.recipe-detail__ingredients li.is-done,
.recipe-detail__steps li.is-done {
  color: var(--color-text-muted);
}
.recipe-detail__ingredients li.is-done .recipe-detail__checkoff-label span,
.recipe-detail__steps li.is-done .recipe-detail__checkoff-label span {
  text-decoration: line-through;
}
.recipe-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.recipe-detail__tag {
  padding: var(--space-1) var(--space-3);
  background: var(--color-surface-2);
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  color: var(--color-text);
}
.btn {
  padding: var(--space-2) var(--space-4);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  text-decoration: none;
}
.btn--secondary { background: var(--color-surface-2); color: var(--color-text); }
</style>
