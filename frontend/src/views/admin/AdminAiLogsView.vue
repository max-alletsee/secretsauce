<!-- frontend/src/views/admin/AdminAiLogsView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminUserPicker from '@/components/admin/AdminUserPicker.vue'
import LogFilterBar from '@/components/admin/LogFilterBar.vue'
import { useAdminLogsStore } from '@/stores/useAdminLogsStore'
import PourLoader from '@/components/base/PourLoader.vue'
import BaseCard from '@/components/base/BaseCard.vue'

const store = useAdminLogsStore()
const callTypeFilter = ref('')
const successFilter = ref<'all' | 'true' | 'false'>('all')
const userIdFilter = ref<string | null>(null)

onMounted(() => fetchLogs())

async function fetchLogs() {
  await store.fetchAiLogs({
    call_type: callTypeFilter.value || undefined,
    success: successFilter.value === 'all' ? undefined : successFilter.value === 'true',
    user_id: userIdFilter.value || undefined,
  })
}
</script>

<template>
  <div>
    <LogFilterBar :loading="store.loading" @refresh="fetchLogs">
      <select v-model="callTypeFilter" class="filter-select" @change="fetchLogs">
        <option value="">All types</option>
        <option value="url_import">url-import</option>
        <option value="image_import">image-import</option>
        <option value="meal_plan">meal-plan</option>
      </select>
      <select v-model="successFilter" class="filter-select" @change="fetchLogs">
        <option value="all">All statuses</option>
        <option value="true">Success</option>
        <option value="false">Failed</option>
      </select>
      <AdminUserPicker v-model="userIdFilter" @update:model-value="fetchLogs" />
    </LogFilterBar>

    <BaseCard class="table-card">
      <div v-if="store.loading" class="loading"><PourLoader /></div>
      <div v-else-if="!store.aiLogs.length" class="empty">No AI log entries found.</div>
      <div v-else class="table-scroll">
        <div class="table-grid">
          <div class="table-header">
            <span>Time</span><span>Type</span><span>Model</span>
            <span>In tok</span><span>Out tok</span><span>Latency</span>
          </div>

          <div v-for="entry in store.aiLogs" :key="entry.id" class="log-row">
            <span class="ts">{{ entry.created_at.slice(11, 19) }}</span>
            <span class="call-type">{{ entry.call_type }}</span>
            <span class="model">{{ entry.model.slice(0, 12) }}</span>
            <span>{{ entry.input_tokens.toLocaleString() }}</span>
            <span>{{ entry.output_tokens.toLocaleString() }}</span>
            <span :class="entry.success ? 'latency-ok' : 'latency-err'">
              {{ entry.success ? `${(entry.latency_ms / 1000).toFixed(1)}s` : entry.error_message || 'failed' }}
            </span>
          </div>
        </div>
      </div>
    </BaseCard>

    <button v-if="store.aiLogsHasMore" class="load-more" :disabled="store.loading" @click="store.loadMoreAiLogs">
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
  /* Sum of fixed column widths (80+100+100+70+70+80=500) + 5 gaps of 8px (40) + ~20px row padding */
  min-width: 560px;
}
.table-header {
  display: grid; grid-template-columns: 80px 100px 100px 70px 70px 80px;
  gap: 8px; padding: 4px 10px; background: var(--color-surface); font-size: 11px;
  color: var(--color-text-muted); text-transform: uppercase;
}
.log-row {
  display: grid; grid-template-columns: 80px 100px 100px 70px 70px 80px;
  gap: 8px; padding: 5px 10px; border-bottom: 1px solid var(--color-surface); font-size: 12px; align-items: center;
}
.ts { color: var(--color-text-muted); }
.call-type { color: var(--color-primary); }
.model { color: var(--color-text-muted); font-size: 11px; }
.latency-ok  { color: var(--color-success); }
.latency-err { color: var(--color-danger); }
.loading, .empty { padding: var(--space-5) var(--space-4); color: var(--color-text-muted); text-align: center; }
.load-more {
  margin-top: 10px; background: var(--color-surface-2); color: var(--color-accent); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: 6px 14px; font-size: 12px; cursor: pointer;
}
</style>
