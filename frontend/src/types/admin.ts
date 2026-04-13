// frontend/src/types/admin.ts

export interface AdminUser {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  is_superuser: boolean
  is_verified: boolean
  preferred_units: 'metric' | 'imperial'
  created_at: string
  updated_at: string
}

export interface UserStats {
  recipe_count: number
  meal_plan_count: number
  last_active: string | null
}

export interface PaginatedAdminUsersResponse {
  items: AdminUser[]
  next_cursor: string | null
  has_more: boolean
}

export interface AICallLog {
  id: string
  user_id: string | null
  call_type: string
  model: string
  prompt_summary: string
  latency_ms: number
  input_tokens: number
  output_tokens: number
  success: boolean
  error_message: string | null
  created_at: string
}

export interface PaginatedAICallLogResponse {
  items: AICallLog[]
  next_cursor: string | null
  has_more: boolean
}

export type AuditAction = 'PROMOTE' | 'DEMOTE' | 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'CLEANUP'

export interface AdminAuditLog {
  id: string
  admin_id: string
  admin_email: string
  action: AuditAction
  target_user_id: string | null
  target_email: string | null
  details: Record<string, unknown>
  description: string
  created_at: string
}

export interface PaginatedAuditLogResponse {
  items: AdminAuditLog[]
  next_cursor: string | null
  has_more: boolean
}

export interface AppLogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  method: string
  path: string
  status_code: number
  latency_ms: number
  user_id: string | null
}

export interface AppLogsResponse {
  items: AppLogEntry[]
}

export interface AdminUserUpdate {
  is_active?: boolean
  is_superuser?: boolean
}
