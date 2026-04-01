// frontend/src/types/importTask.ts

export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface ImportTaskCreated {
  task_id: string
  status: string
}
