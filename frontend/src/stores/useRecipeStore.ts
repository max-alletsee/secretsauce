// frontend/src/stores/useRecipeStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as recipesApi from '@/api/recipes'
import type {
  Recipe,
  RecipeCreatePayload,
  RecipeUpdatePayload,
  RecipeVersion,
} from '@/types/recipe'

export const useRecipeStore = defineStore('recipes', () => {
  const recipes = ref<Recipe[]>([])
  const currentRecipe = ref<Recipe | null>(null)
  const versions = ref<RecipeVersion[]>([])
  const loading = ref(false)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(true)

  async function fetchRecipes() {
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipes()
      recipes.value = data.items
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipes({ cursor: nextCursor.value ?? undefined })
      recipes.value.push(...data.items)
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function fetchRecipe(id: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipe(id)
      currentRecipe.value = data
    } finally {
      loading.value = false
    }
  }

  async function createRecipe(payload: RecipeCreatePayload): Promise<Recipe> {
    loading.value = true
    try {
      const { data } = await recipesApi.createRecipe(payload)
      return data
    } finally {
      loading.value = false
    }
  }

  async function updateRecipe(id: string, payload: RecipeUpdatePayload) {
    loading.value = true
    try {
      const { data } = await recipesApi.updateRecipe(id, payload)
      currentRecipe.value = data
    } finally {
      loading.value = false
    }
  }

  async function deleteRecipe(id: string) {
    loading.value = true
    try {
      await recipesApi.deleteRecipe(id)
      recipes.value = recipes.value.filter((r) => r.id !== id)
      if (currentRecipe.value?.id === id) currentRecipe.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchVersions(id: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.getVersions(id)
      versions.value = data
    } finally {
      loading.value = false
    }
  }

  async function restoreVersion(recipeId: string, versionId: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.restoreVersion(recipeId, versionId)
      currentRecipe.value = data
      await fetchVersions(recipeId)
    } finally {
      loading.value = false
    }
  }

  return {
    recipes,
    currentRecipe,
    versions,
    loading,
    nextCursor,
    hasMore,
    fetchRecipes,
    loadMore,
    fetchRecipe,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    fetchVersions,
    restoreVersion,
  }
})
