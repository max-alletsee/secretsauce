// frontend/src/stores/useAdminUsersStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as adminApi from '@/api/admin'
import type { AdminUser, AdminUserUpdate, UserStats } from '@/types/admin'

export const useAdminUsersStore = defineStore('adminUsers', () => {
  const users = ref<AdminUser[]>([])
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const loading = ref(false)
  const expandedUserId = ref<string | null>(null)
  const userStats = ref<Record<string, UserStats>>({})
  const statsLoading = ref<Record<string, boolean>>({})

  async function fetchUsers(params?: {
    search?: string
    status?: 'active' | 'inactive'
    role?: 'user' | 'superuser'
  }) {
    loading.value = true
    try {
      const { data } = await adminApi.listUsers({ ...params, limit: 20 })
      users.value = data.items
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || !nextCursor.value) return
    loading.value = true
    try {
      const { data } = await adminApi.listUsers({ cursor: nextCursor.value, limit: 20 })
      users.value.push(...data.items)
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  async function expandUser(userId: string) {
    if (expandedUserId.value === userId) {
      expandedUserId.value = null
      return
    }
    expandedUserId.value = userId
    if (!userStats.value[userId]) {
      statsLoading.value[userId] = true
      try {
        const { data } = await adminApi.getUserStats(userId)
        userStats.value[userId] = data
      } finally {
        statsLoading.value[userId] = false
      }
    }
  }

  async function updateUser(userId: string, data: AdminUserUpdate) {
    const { data: updated } = await adminApi.updateUser(userId, data)
    const idx = users.value.findIndex((u) => u.id === userId)
    if (idx !== -1) users.value[idx] = updated
  }

  async function deleteUser(userId: string) {
    await adminApi.deleteUser(userId)
    users.value = users.value.filter((u) => u.id !== userId)
    if (expandedUserId.value === userId) expandedUserId.value = null
  }

  return {
    users, nextCursor, hasMore, loading,
    expandedUserId, userStats, statsLoading,
    fetchUsers, loadMore, expandUser, updateUser, deleteUser,
  }
})
