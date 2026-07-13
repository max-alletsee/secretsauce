<!-- frontend/src/views/admin/AdminAppLogsView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminUserPicker from '@/components/admin/AdminUserPicker.vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'
import PourLoader from '@/components/base/PourLoader.vue'
import BaseCard from '@/components/base/BaseCard.vue'

const store = useAdminLogsStore()
const levelFilter = ref('')
const userIdFilter = ref<string | null>(null)
const limitFilter = ref(100)

onMounted(() => fetchLogs())

async function fetchLogs() {
  await store.fetchAppLogs({
    level: levelFilter.value || undefined,
    user_id: userIdFilter.value || undefined,
    limit: limitFilter.value,
  })
}

function levelClass(level: string) {
  return { 'level-info': level === 'INFO', 'level-warn': level === 'WARN', 'level-error': level === 'ERROR' }
}
</script>

<template>
  <div>
    <LogFilterBar :loading="store.loading" @refresh="fetchLogs">
      <select v-model="levelFilter" class="filter-select" @change="fetchLogs">
        <option value="">All levels</option>
        <option>INFO</option>
        <option>WARN</option>
        <option>ERROR</option>
      </select>
      <select v-model="limitFilter" class="filter-select" @change="fetchLogs">
        <option :value="50">Last 50</option>
        <option :value="100">Last 100</option>
        <option :value="500">Last 500</option>
      </select>
      <AdminUserPicker v-model="userIdFilter" @update:model-value="fetchLogs" />
    </LogFilterBar>

    <BaseCard class="table-card">
      <div v-if="store.loading" class="loading"><PourLoader /></div>
      <div v-else-if="!store.appLogs.length" class="empty">No log entries found.</div>
      <div v-else class="table-scroll">
        <div class="table-grid">
          <div class="log-table-header">
            <span>Time</span><span>Level</span><span>Path</span><span>Status</span><span>Latency</span>
          </div>

          <div v-for="entry in store.appLogs" :key="entry.timestamp + entry.path" class="log-row">
            <span class="ts">{{ entry.timestamp.slice(11, 19) }}</span>
            <span class="level-badge" :class="levelClass(entry.level)">{{ entry.level }}</span>
            <span class="path">{{ entry.method }} {{ entry.path }}</span>
            <span>{{ entry.status_code }}</span>
            <span>{{ entry.latency_ms }}ms</span>
          </div>
        </div>
      </div>
    </BaseCard>

    <div class="footnote">Structured JSON request log · read-only</div>
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
  /* Fixed columns (80+70+60+70) + a livable width for the 1fr path column + 4 gaps of 8px */
  min-width: 620px;
}
.log-table-header {
  display: grid; grid-template-columns: 80px 70px 1fr 60px 70px;
  gap: 8px; padding: 4px 10px; background: var(--color-surface); font-size: 11px;
  color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em;
}
.log-row {
  display: grid; grid-template-columns: 80px 70px 1fr 60px 70px;
  gap: 8px; padding: 5px 10px; border-bottom: 1px solid var(--color-surface); font-size: 12px;
}
.ts { color: var(--color-text-muted); }
.level-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
.level-info  { color: var(--color-success); background: var(--color-bg); }
.level-warn  { color: var(--color-warning); background: var(--color-bg); }
.level-error { color: var(--color-danger); background: var(--color-danger-soft); }
.path { color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loading, .empty { padding: var(--space-5) var(--space-4); color: var(--color-text-muted); text-align: center; }
.footnote { font-size: 11px; color: var(--color-text-muted); margin-top: 8px; }
</style>
