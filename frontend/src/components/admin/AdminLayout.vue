<!-- frontend/src/components/admin/AdminLayout.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import * as adminApi from '@/api/admin'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'

const route = useRoute()
const cleanupStatus = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const cleanupMessage = ref('')
const confirmingCleanup = ref(false)

function requestCleanup() {
  confirmingCleanup.value = true
}

function cancelCleanup() {
  confirmingCleanup.value = false
}

async function confirmCleanup() {
  confirmingCleanup.value = false
  cleanupStatus.value = 'loading'
  try {
    const { data } = await adminApi.triggerCleanup()
    cleanupMessage.value = `Deleted ${data.deleted_count} files`
    cleanupStatus.value = 'done'
  } catch {
    cleanupMessage.value = 'Cleanup failed'
    cleanupStatus.value = 'error'
  } finally {
    setTimeout(() => {
      cleanupStatus.value = 'idle'
      cleanupMessage.value = ''
    }, 3000)
  }
}

const navItems = [
  { name: 'admin-users',      label: 'Users',     to: '/admin/users' },
  { name: 'admin-logs-app',   label: 'App Logs',  to: '/admin/logs/app' },
  { name: 'admin-logs-ai',    label: 'AI Logs',   to: '/admin/logs/ai' },
  { name: 'admin-logs-audit', label: 'Audit Log', to: '/admin/logs/audit' },
]
</script>

<template>
  <div class="admin-layout" data-theme="dark">
    <aside class="admin-sidebar">
      <div class="sidebar-header">Admin</div>
      <nav>
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="nav-item"
          :class="{ active: route.name === item.name }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="sidebar-footer">
        <button
          class="cleanup-btn"
          :disabled="cleanupStatus === 'loading'"
          @click="requestCleanup"
        >
          <span v-if="cleanupStatus === 'loading'">Running…</span>
          <span v-else-if="cleanupStatus === 'done' || cleanupStatus === 'error'">{{ cleanupMessage }}</span>
          <span v-else>Run Cleanup</span>
        </button>
      </div>
    </aside>
    <main class="admin-main">
      <RouterView />
    </main>

    <ConfirmDialog
      :open="confirmingCleanup"
      dark
      title="Run cleanup?"
      message="Deletes expired temp upload files (from in-progress or abandoned recipe imports) that are past their retention window. This can't be undone."
      confirm-label="Run cleanup"
      @confirm="confirmCleanup"
      @cancel="cancelCleanup"
    />
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}

.admin-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.sidebar-header {
  padding: 16px;
  color: var(--color-primary);
  font-weight: 700;
  font-size: 14px;
  border-bottom: 1px solid var(--color-surface-2);
}

.nav-item {
  display: block;
  padding: 10px 16px;
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 13px;
  border-left: 3px solid transparent;
  transition: color 0.15s;
}

.nav-item.active,
.nav-item:hover {
  color: var(--color-text);
}

.nav-item.active {
  background: var(--color-surface-2);
  border-left-color: var(--color-primary);
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid var(--color-surface-2);
}

.cleanup-btn {
  width: 100%;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  border: none;
  border-radius: var(--radius-sm);
  padding: 7px 8px;
  font-size: 12px;
  cursor: pointer;
  text-align: center;
}

.cleanup-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-main {
  flex: 1;
  background: var(--color-bg);
  color: var(--color-text);
  overflow: auto;
  padding: 20px;
}

@media (max-width: 767px) {
  .admin-layout {
    flex-direction: column;
  }
  .admin-sidebar {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .sidebar-header { display: none; }
  .nav-item { padding: 8px 12px; font-size: 12px; }
  .sidebar-footer { display: none; }
}
</style>
