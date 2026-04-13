<!-- frontend/src/components/admin/AdminLayout.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import * as adminApi from '@/api/admin'

const route = useRoute()
const cleanupStatus = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const cleanupMessage = ref('')

async function runCleanup() {
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
  <div class="admin-layout">
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
          @click="runCleanup"
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
  background: #111827;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.sidebar-header {
  padding: 16px;
  color: #a78bfa;
  font-weight: 700;
  font-size: 14px;
  border-bottom: 1px solid #1f2937;
}

.nav-item {
  display: block;
  padding: 10px 16px;
  color: #6b7280;
  text-decoration: none;
  font-size: 13px;
  border-left: 3px solid transparent;
  transition: color 0.15s;
}

.nav-item.active,
.nav-item:hover {
  color: #e5e7eb;
}

.nav-item.active {
  background: #1f2937;
  border-left-color: #a78bfa;
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid #1f2937;
}

.cleanup-btn {
  width: 100%;
  background: #1f2937;
  color: #9ca3af;
  border: none;
  border-radius: 4px;
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
  background: #0f172a;
  color: #e5e7eb;
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
