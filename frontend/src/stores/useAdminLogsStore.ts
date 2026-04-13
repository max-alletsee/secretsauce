// frontend/src/stores/useAdminLogsStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as adminApi from '@/api/admin'
import type { AICallLog, AdminAuditLog, AppLogEntry } from '@/types/admin'

export const useAdminLogsStore = defineStore('adminLogs', () => {
  const appLogs = ref<AppLogEntry[]>([])
  const aiLogs = ref<AICallLog[]>([])
  const auditLogs = ref<AdminAuditLog[]>([])
  const aiLogsNextCursor = ref<string | null>(null)
  const aiLogsHasMore = ref(false)
  const auditLogsNextCursor = ref<string | null>(null)
  const auditLogsHasMore = ref(false)
  const loading = ref(false)

  async function fetchAppLogs(params?: { level?: string; user_id?: string; limit?: number }) {
    loading.value = true
    try {
      const { data } = await adminApi.getAppLogs(params)
      appLogs.value = data.items
    } finally {
      loading.value = false
    }
  }

  async function fetchAiLogs(params?: {
    call_type?: string; success?: boolean; user_id?: string; since?: string
  }) {
    loading.value = true
    try {
      const { data } = await adminApi.getAiLogs({ ...params, limit: 20 })
      aiLogs.value = data.items
      aiLogsNextCursor.value = data.next_cursor
      aiLogsHasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMoreAiLogs() {
    if (!aiLogsHasMore.value || !aiLogsNextCursor.value) return
    const { data } = await adminApi.getAiLogs({ cursor: aiLogsNextCursor.value, limit: 20 })
    aiLogs.value.push(...data.items)
    aiLogsNextCursor.value = data.next_cursor
    aiLogsHasMore.value = data.has_more
  }

  async function fetchAuditLogs(params?: { action?: string; since?: string }) {
    loading.value = true
    try {
      const { data } = await adminApi.getAuditLogs({ ...params, limit: 20 })
      auditLogs.value = data.items
      auditLogsNextCursor.value = data.next_cursor
      auditLogsHasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMoreAuditLogs() {
    if (!auditLogsHasMore.value || !auditLogsNextCursor.value) return
    const { data } = await adminApi.getAuditLogs({ cursor: auditLogsNextCursor.value, limit: 20 })
    auditLogs.value.push(...data.items)
    auditLogsNextCursor.value = data.next_cursor
    auditLogsHasMore.value = data.has_more
  }

  return {
    appLogs, aiLogs, auditLogs,
    aiLogsNextCursor, aiLogsHasMore,
    auditLogsNextCursor, auditLogsHasMore,
    loading,
    fetchAppLogs, fetchAiLogs, loadMoreAiLogs,
    fetchAuditLogs, loadMoreAuditLogs,
  }
})
