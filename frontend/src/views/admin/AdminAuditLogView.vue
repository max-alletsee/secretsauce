<!-- frontend/src/views/admin/AdminAuditLogView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'
import type { AuditAction } from '@/types/admin'

const store = useAdminLogsStore()
const actionFilter = ref<AuditAction | ''>('')

onMounted(() => fetchLogs())

async function fetchLogs() {
  await store.fetchAuditLogs({
    action: actionFilter.value || undefined,
  })
}

const badgeClass: Record<AuditAction, string> = {
  PROMOTE:    'badge-blue',
  DEMOTE:     'badge-blue',
  ACTIVATE:   'badge-green',
  DEACTIVATE: 'badge-amber',
  DELETE:     'badge-red',
  CLEANUP:    'badge-grey',
}
</script>

<template>
  <div>
    <LogFilterBar :loading="store.loading" @refresh="fetchLogs">
      <select v-model="actionFilter" class="filter-select" @change="fetchLogs">
        <option value="">All actions</option>
        <option>PROMOTE</option>
        <option>DEMOTE</option>
        <option>ACTIVATE</option>
        <option>DEACTIVATE</option>
        <option>DELETE</option>
        <option>CLEANUP</option>
      </select>
    </LogFilterBar>

    <div class="table-header">
      <span>Time</span><span>Action</span><span>Description</span><span>By</span>
    </div>

    <div v-if="store.loading" class="loading">Loading…</div>
    <div v-else-if="!store.auditLogs.length" class="empty">No audit log entries found.</div>

    <div v-for="entry in store.auditLogs" :key="entry.id" class="log-row">
      <span class="ts">{{ entry.created_at.slice(0, 10) }}</span>
      <span class="badge" :class="badgeClass[entry.action]">{{ entry.action }}</span>
      <span class="description">{{ entry.description }}</span>
      <span class="by">{{ entry.admin_email }}</span>
    </div>

    <button v-if="store.auditLogsHasMore" class="load-more" @click="store.loadMoreAuditLogs">
      Load more
    </button>
  </div>
</template>

<style scoped>
.filter-select {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 5px 8px; color: #9ca3af; font-size: 12px;
}
.table-header {
  display: grid; grid-template-columns: 90px 100px 1fr 140px;
  gap: 8px; padding: 4px 10px; background: #1e293b; font-size: 11px;
  color: #64748b; text-transform: uppercase;
}
.log-row {
  display: grid; grid-template-columns: 90px 100px 1fr 140px;
  gap: 8px; padding: 6px 10px; border-bottom: 1px solid #1e293b; font-size: 12px; align-items: center;
}
.ts { color: #4b5563; }
.badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
.badge-blue  { color: #93c5fd; background: #172554; }
.badge-green { color: #4ade80; background: #052e16; }
.badge-amber { color: #fbbf24; background: #451a03; }
.badge-red   { color: #f87171; background: #450a0a; }
.badge-grey  { color: #9ca3af; background: #1f2937; }
.description { color: #d1d5db; }
.by { color: #a78bfa; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.loading, .empty { padding: 20px; color: #6b7280; text-align: center; }
.load-more {
  margin-top: 10px; background: #1f2937; color: #60a5fa; border: 1px solid #374151;
  border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer;
}
</style>
