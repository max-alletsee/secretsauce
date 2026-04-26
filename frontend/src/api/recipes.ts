import client from './client'
import type {
  Recipe,
  RecipeCreatePayload,
  RecipeUpdatePayload,
  RecipeVersion,
} from '@/types/recipe'
import type { PaginatedResponse } from '@/types/common'
import type { ImportTaskCreated } from '@/types/importTask'

export const getRecipes = (params?: {
  cursor?: string
  limit?: number
  q?: string
  tags?: string[]
  sort_by?: string
}) => client.get<PaginatedResponse<Recipe>>('/recipes', { params })

export const getRecipe = (id: string) =>
  client.get<Recipe>(`/recipes/${id}`)

export const createRecipe = (data: RecipeCreatePayload) =>
  client.post<Recipe>('/recipes', data)

export const updateRecipe = (id: string, data: RecipeUpdatePayload) =>
  client.patch<Recipe>(`/recipes/${id}`, data)

export const deleteRecipe = (id: string) =>
  client.delete(`/recipes/${id}`)

export const getVersions = (id: string) =>
  client.get<RecipeVersion[]>(`/recipes/${id}/versions`)

export const restoreVersion = (id: string, versionId: string) =>
  client.post<Recipe>(`/recipes/${id}/versions/${versionId}/restore`)

export const generateRecipe = (title: string) =>
  client.post<ImportTaskCreated>('/recipes/generate', { title })
