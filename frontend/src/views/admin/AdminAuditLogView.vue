<!-- frontend/src/views/admin/AdminAuditLogView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'
import type { AuditAction } from '@/types/admin'
import PourLoader from '@/components/base/PourLoader.vue'
import BaseCard from '@/components/base/BaseCard.vue'

const store = useAdminLogsStore()
const actionFilter = ref<AuditAction | ''>('')

onMounted(() => fetchLogs())

async function fetchLogs() {
  await store.fetchAuditLogs({
    action: actionFilter.value || undefined,
  })
}

const badgeClass: Record<AuditAction, string> = {
  PROMOTE:        'badge-blue',
  DEMOTE:         'badge-blue',
  ACTIVATE:       'badge-green',
  DEACTIVATE:     'badge-amber',
  DELETE:         'badge-red',
  CLEANUP:        'badge-grey',
  BUDGET_REMOVE:  'badge-amber',
  BUDGET_RESTORE: 'badge-green',
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
        <option>BUDGET_REMOVE</option>
        <option>BUDGET_RESTORE</option>
      </select>
    </LogFilterBar>

    <BaseCard class="table-card">
      <div v-if="store.loading" class="loading"><PourLoader /></div>
      <div v-else-if="!store.auditLogs.length" class="empty">No audit log entries found.</div>
      <div v-else class="table-scroll">
        <div class="table-grid">
          <div class="table-header">
            <span>Time</span><span>Action</span><span>Description</span><span>By</span>
          </div>

          <div v-for="entry in store.auditLogs" :key="entry.id" class="log-row">
            <span class="ts">{{ entry.created_at.slice(0, 10) }}</span>
            <span class="badge" :class="badgeClass[entry.action]">{{ entry.action }}</span>
            <span class="description">{{ entry.description }}</span>
            <span class="by">{{ entry.admin_email }}</span>
          </div>
        </div>
      </div>
    </BaseCard>

    <button v-if="store.auditLogsHasMore" class="load-more" @click="store.loadMoreAuditLogs">
      Load more
    </button>
  </div>
</template>

<style scoped>
.filter-select {
  background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 5px 8px; color: var(--color-text-muted); font-size: 12px;
}
.table-card {
  padding: 0;
  overflow: hidden;
}
.table-scroll {
  overflow-x: auto;
}
.table-grid {
  /* Fixed columns (90+100+140) + a livable width for the 1fr description column + 3 gaps of 8px */
  min-width: 640px;
}
.table-header {
  display: grid; grid-template-columns: 90px 100px 1fr 140px;
  gap: 8px; padding: 4px 10px; background: var(--color-surface); font-size: 11px;
  color: var(--color-text-muted); text-transform: uppercase;
}
.log-row {
  display: grid; grid-template-columns: 90px 100px 1fr 140px;
  gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--color-surface); font-size: 12px; align-items: center;
}
.ts { color: var(--color-text-muted); }
.badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
.badge-blue  { color: var(--color-accent); background: var(--color-accent-soft); }
.badge-green { color: var(--color-success); background: var(--color-bg); }
.badge-amber { color: var(--color-warning); background: var(--color-bg); }
.badge-red   { color: var(--color-danger); background: var(--color-danger-soft); }
.badge-grey  { color: var(--color-text-muted); background: var(--color-surface-2); }
.description { color: var(--color-text); }
.by { color: var(--color-primary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.loading, .empty { padding: var(--space-5) var(--space-4); color: var(--color-text-muted); text-align: center; }
.load-more {
  margin-top: 10px; background: var(--color-surface-2); color: var(--color-accent); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: 6px 14px; font-size: 12px; cursor: pointer;
}
</style>
