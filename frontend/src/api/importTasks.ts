// frontend/src/api/importTasks.ts
import client from './client'
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'

export const importRecipeFromUrl = (url: string) =>
  client.post<ImportTaskCreated>('/recipes/import/url', { url })

export const getImportTask = (taskId: string) =>
  client.get<ImportTask>(`/import-tasks/${taskId}`)
