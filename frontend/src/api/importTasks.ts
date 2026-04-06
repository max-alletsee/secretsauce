// frontend/src/api/importTasks.ts
import client from './client'
import type { ImportTask, ImportTaskCreated } from '@/types/importTask'

export const importRecipeFromUrl = (url: string) =>
  client.post<ImportTaskCreated>('/recipes/import/url', { url })

export const importRecipeFromImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return client.post<ImportTaskCreated>('/recipes/import/image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const getImportTask = (taskId: string) =>
  client.get<ImportTask>(`/import-tasks/${taskId}`)
