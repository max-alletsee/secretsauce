// frontend/src/types/importTask.ts

export type ImportStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  import_type: 'url' | 'image'
  result_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface ImportTaskCreated {
  task_id: string
  status: string
}
