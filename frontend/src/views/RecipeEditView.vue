<!-- frontend/src/views/RecipeEditView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import RecipeForm from '@/components/RecipeForm.vue'
import type { RecipeCreatePayload, RecipeUpdatePayload } from '@/types/recipe'
import type { RecipeData } from '@/types/importTask'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const userStore = useUserStore()
const error = ref('')
const ready = ref(false)

const recipeId = route.params.id as string

const importedRecipe = (history.state?.importedRecipe ?? null) as RecipeData | null

const initialData = computed<Partial<RecipeCreatePayload> | undefined>(() => {
  const source = importedRecipe ?? recipeStore.currentRecipe
  if (!source) return undefined
  const v = source.current_version
  return {
    title: v.title,
    description: v.description,
    ingredients: v.ingredients.map((ing) => ({ ...ing, quantity: ing.quantity ?? '' })),
    steps: v.steps,
    servings: v.servings,
    prep_time_minutes: v.prep_time_minutes,
    waiting_time_minutes: v.waiting_time_minutes,
    cook_time_minutes: v.cook_time_minutes,
    tags: v.tags,
    recipe_source: v.recipe_source as Partial<RecipeCreatePayload>['recipe_source'],
    visibility: source.visibility,
  }
})

onMounted(async () => {
  if (importedRecipe) {
    ready.value = true
    return
  }
  try {
    await recipeStore.fetchRecipe(recipeId)
    if (recipeStore.currentRecipe?.owner_id !== userStore.user?.id) {
      router.replace(`/recipes/${recipeId}`)
      return
    }
    ready.value = true
  } catch {
    router.replace('/recipes')
  }
})

async function handleSubmit(data: RecipeCreatePayload) {
  error.value = ''
  try {
    await recipeStore.updateRecipe(recipeId, data as RecipeUpdatePayload)
    router.push(`/recipes/${recipeId}`)
  } catch {
    error.value = 'Failed to save changes. Please try again.'
  }
}
</script>

<template>
  <main class="recipe-edit-page">
    <div v-if="!ready" class="recipe-edit-page__loading">Loading…</div>

    <template v-else-if="ready && initialData">
      <h1>Edit recipe</h1>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <RecipeForm
        :initial-data="initialData"
        submit-label="Save changes"
        @submit="handleSubmit"
        @cancel="router.push(`/recipes/${recipeId}`)"
      />
    </template>
  </main>
</template>

<style scoped>
.recipe-edit-page {
  padding: 1rem;
  max-width: 720px;
  margin: 0 auto;
}
.recipe-edit-page__loading {
  text-align: center;
  padding: 3rem 0;
  color: #6b7280;
}
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem;
}
.error {
  color: #dc2626;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
</style>
