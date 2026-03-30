<!-- frontend/src/views/RecipeCreateView.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import RecipeForm from '@/components/RecipeForm.vue'
import type { RecipeCreatePayload } from '@/types/recipe'

const router = useRouter()
const recipeStore = useRecipeStore()
const error = ref('')

async function handleSubmit(data: RecipeCreatePayload) {
  error.value = ''
  try {
    const recipe = await recipeStore.createRecipe(data)
    router.push(`/recipes/${recipe.id}`)
  } catch {
    error.value = 'Failed to create recipe. Please try again.'
  }
}
</script>

<template>
  <main class="recipe-create-page">
    <h1>New recipe</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <RecipeForm submit-label="Create recipe" @submit="handleSubmit" @cancel="router.back()" />
  </main>
</template>

<style scoped>
.recipe-create-page {
  padding: 1rem;
  max-width: 720px;
  margin: 0 auto;
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
