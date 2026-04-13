<!-- frontend/src/views/admin/AdminAppLogsView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminUserPicker from '@/components/admin/AdminUserPicker.vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'

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

    <div class="log-table-header">
      <span>Time</span><span>Level</span><span>Path</span><span>Status</span><span>Latency</span>
    </div>

    <div v-if="store.loading" class="loading">Loading…</div>
    <div v-else-if="!store.appLogs.length" class="empty">No log entries found.</div>

    <div v-for="entry in store.appLogs" :key="entry.timestamp + entry.path" class="log-row">
      <span class="ts">{{ entry.timestamp.slice(11, 19) }}</span>
      <span class="level-badge" :class="levelClass(entry.level)">{{ entry.level }}</span>
      <span class="path">{{ entry.method }} {{ entry.path }}</span>
      <span>{{ entry.status_code }}</span>
      <span>{{ entry.latency_ms }}ms</span>
    </div>

    <div class="footnote">Structured JSON request log · read-only</div>
  </div>
</template>

<style scoped>
.filter-select {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 5px 8px; color: #9ca3af; font-size: 12px;
}
.log-table-header {
  display: grid; grid-template-columns: 80px 70px 1fr 60px 70px;
  gap: 8px; padding: 4px 10px; background: #1e293b; font-size: 11px;
  color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;
}
.log-row {
  display: grid; grid-template-columns: 80px 70px 1fr 60px 70px;
  gap: 8px; padding: 5px 10px; border-bottom: 1px solid #1e293b; font-size: 12px;
}
.ts { color: #4b5563; }
.level-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
.level-info  { color: #4ade80; background: #052e16; }
.level-warn  { color: #fbbf24; background: #451a03; }
.level-error { color: #f87171; background: #450a0a; }
.path { color: #d1d5db; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loading, .empty { padding: 20px; color: #6b7280; text-align: center; }
.footnote { font-size: 11px; color: #4b5563; margin-top: 8px; }
</style>
