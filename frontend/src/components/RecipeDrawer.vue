<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import * as recipesApi from '@/api/recipes'
import { formatIngredient } from '@/composables/useFormatIngredient'
import type { Recipe, RecipeCreatePayload, RecipeVersion } from '@/types/recipe'
import type { RecipeVersionData } from '@/types/importTask'

const props = defineProps<{
  recipeId?: string
  draftRecipe?: RecipeVersionData
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', recipe: Recipe): void
}>()

const userStore = useUserStore()
const recipeStore = useRecipeStore()

const fetchedRecipe = ref<Recipe | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)

const isOwner = computed(
  () =>
    fetchedRecipe.value !== null &&
    userStore.user !== null &&
    fetchedRecipe.value.owner_id === userStore.user.id,
)

let latestReqId = 0

watch(
  () => props.recipeId,
  async (id) => {
    if (!id || props.draftRecipe) return
    const reqId = ++latestReqId
    loading.value = true
    error.value = null
    fetchedRecipe.value = null
    try {
      const { data } = await recipesApi.getRecipe(id)
      if (reqId === latestReqId) fetchedRecipe.value = data
    } catch {
      if (reqId === latestReqId) error.value = 'Failed to load recipe.'
    } finally {
      if (reqId === latestReqId) loading.value = false
    }
  },
  { immediate: true },
)

const version = computed((): RecipeVersionData | RecipeVersion | null => {
  if (props.draftRecipe) return props.draftRecipe
  return fetchedRecipe.value?.current_version ?? null
})

const totalTime = computed((): number | null => {
  if (!version.value) return null
  const prep = version.value.prep_time_minutes ?? 0
  const wait = version.value.waiting_time_minutes ?? 0
  const cook = version.value.cook_time_minutes ?? 0
  return prep + wait + cook || null
})

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

async function saveToMyRecipes() {
  if (!props.draftRecipe) return
  saving.value = true
  error.value = null
  try {
    const payload: RecipeCreatePayload = {
      title: props.draftRecipe.title,
      description: props.draftRecipe.description,
      ingredients: props.draftRecipe.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity ?? '',
        unit: i.unit,
      })),
      steps: props.draftRecipe.steps,
      servings: props.draftRecipe.servings,
      prep_time_minutes: props.draftRecipe.prep_time_minutes,
      waiting_time_minutes: props.draftRecipe.waiting_time_minutes,
      cook_time_minutes: props.draftRecipe.cook_time_minutes,
      tags: props.draftRecipe.tags,
      visibility: 'private',
    }
    const saved = await recipeStore.createRecipe(payload)
    emit('saved', saved)
    emit('close')
  } catch {
    error.value = 'Failed to save recipe. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="drawer-backdrop" @click="emit('close')" />
    <div class="recipe-drawer" role="dialog" aria-modal="true">
      <button class="drawer-close" aria-label="Close" @click="emit('close')">×</button>

      <div v-if="draftRecipe" class="draft-banner">Draft — not yet saved</div>

      <div v-if="loading" class="drawer-loading">Loading…</div>
      <div v-else-if="error" class="drawer-error">{{ error }}</div>

      <template v-else-if="version">
        <h2 class="drawer-title">{{ version.title }}</h2>

        <p v-if="version.description" class="drawer-description">{{ version.description }}</p>

        <div class="drawer-meta">
          <span v-if="version.servings">{{ version.servings }} servings</span>
          <span v-if="totalTime">{{ totalTime }} min total</span>
          <span v-if="version.prep_time_minutes">{{ version.prep_time_minutes }} min prep</span>
          <span v-if="version.cook_time_minutes">{{ version.cook_time_minutes }} min cook</span>
        </div>

        <section class="drawer-section">
          <h3>Ingredients</h3>
          <ul class="drawer-ingredients">
            <li v-for="(ing, i) in version.ingredients" :key="i">
              {{ formatIngredient({ name: ing.name, quantity: ing.quantity ?? '', unit: ing.unit }) }}
            </li>
          </ul>
        </section>

        <section class="drawer-section">
          <h3>Steps</h3>
          <ol class="drawer-steps">
            <li v-for="step in version.steps" :key="step.order">
              {{ step.instruction }}
            </li>
          </ol>
        </section>

        <section v-if="version.tags && version.tags.length" class="drawer-section">
          <div class="drawer-tags">
            <span v-for="tag in version.tags" :key="tag" class="drawer-tag">{{ tag }}</span>
          </div>
        </section>

        <div v-if="draftRecipe" class="drawer-actions">
          <button class="btn btn--primary" :disabled="saving" @click="saveToMyRecipes">
            {{ saving ? 'Saving…' : 'Save to my recipes' }}
          </button>
          <button class="btn btn--secondary" @click="emit('close')">Dismiss</button>
        </div>

        <div v-else-if="isOwner && fetchedRecipe" class="drawer-actions">
          <RouterLink
            :to="`/recipes/${fetchedRecipe.id}/edit`"
            class="btn btn--secondary"
            @click="emit('close')"
          >
            Edit recipe
          </RouterLink>
        </div>
      </template>
      <div v-else class="drawer-error">No recipe to display.</div>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 199;
}
.recipe-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  height: 100dvh;
  background: #fff;
  z-index: 200;
  overflow-y: auto;
  padding: 1.5rem 1.25rem 2rem;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  animation: slide-in 0.2s ease;
}
@keyframes slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
@media (max-width: 767px) {
  .recipe-drawer {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 85dvh;
    border-radius: 16px 16px 0 0;
    animation: slide-up 0.2s ease;
  }
  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
}
.drawer-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem;
}
.drawer-close:hover {
  color: #111;
}
.draft-banner {
  background: #fef9c3;
  border: 1px solid #fde047;
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  color: #854d0e;
  margin-bottom: 1rem;
}
.drawer-loading,
.drawer-error {
  text-align: center;
  padding: 2rem 0;
  color: #6b7280;
}
.drawer-error {
  color: #dc2626;
}
.drawer-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 2rem 0.5rem 0;
  line-height: 1.3;
}
.drawer-description {
  color: #4b5563;
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}
.drawer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.8rem;
  color: #6b7280;
}
.drawer-section {
  margin: 1rem 0;
}
.drawer-section h3 {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin: 0 0 0.5rem;
}
.drawer-ingredients {
  list-style: disc inside;
  padding: 0;
  margin: 0;
  font-size: 0.9rem;
}
.drawer-ingredients li {
  padding: 0.2rem 0;
}
.drawer-steps {
  padding-left: 1.25rem;
  margin: 0;
  font-size: 0.9rem;
}
.drawer-steps li {
  padding: 0.3rem 0;
  line-height: 1.5;
}
.drawer-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.drawer-tag {
  padding: 0.2rem 0.6rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.75rem;
  color: #374151;
}
.drawer-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.btn--primary {
  background: #2563eb;
  color: #fff;
}
.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn--secondary {
  background: #f3f4f6;
  color: #374151;
}
</style>
