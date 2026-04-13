// frontend/src/api/admin.ts
import client from './client'
import type {
  AdminUser,
  AdminUserUpdate,
  AppLogsResponse,
  PaginatedAdminUsersResponse,
  PaginatedAICallLogResponse,
  PaginatedAuditLogResponse,
  UserStats,
} from '@/types/admin'

export const listUsers = (params?: {
  search?: string
  status?: 'active' | 'inactive'
  role?: 'user' | 'superuser'
  cursor?: string
  limit?: number
}) => client.get<PaginatedAdminUsersResponse>('/admin/users', { params })

export const updateUser = (id: string, data: AdminUserUpdate) =>
  client.patch<AdminUser>(`/admin/users/${id}`, data)

export const deleteUser = (id: string) => client.delete(`/admin/users/${id}`)

export const getUserStats = (id: string) =>
  client.get<UserStats>(`/admin/users/${id}/stats`)

export const getAppLogs = (params?: {
  level?: string
  user_id?: string
  limit?: number
}) => client.get<AppLogsResponse>('/admin/logs/app', { params })

export const getAiLogs = (params?: {
  call_type?: string
  success?: boolean
  user_id?: string
  since?: string
  cursor?: string
  limit?: number
}) => client.get<PaginatedAICallLogResponse>('/admin/logs/ai', { params })

export const getAuditLogs = (params?: {
  action?: string
  since?: string
  cursor?: string
  limit?: number
}) => client.get<PaginatedAuditLogResponse>('/admin/logs/audit', { params })

export const triggerCleanup = () =>
  client.post<{ deleted_count: number }>('/admin/cleanup')
