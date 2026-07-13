<!-- frontend/src/views/admin/AdminUsersView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminUserRow from '@/components/admin/AdminUserRow.vue'
import { useAdminUsersStore } from '@/stores/useAdminUsersStore'
import PourLoader from '@/components/base/PourLoader.vue'

const store = useAdminUsersStore()
const search = ref('')
const statusFilter = ref<'active' | 'inactive' | ''>('')
const roleFilter = ref<'user' | 'superuser' | ''>('')

onMounted(() => fetchUsers())

async function fetchUsers() {
  await store.fetchUsers({
    search: search.value || undefined,
    status: (statusFilter.value || undefined) as 'active' | 'inactive' | undefined,
    role: (roleFilter.value || undefined) as 'user' | 'superuser' | undefined,
  })
}
</script>

<template>
  <div>
    <div class="toolbar">
      <input v-model="search" class="search-input" placeholder="Search by email or name…" @keydown.enter="fetchUsers" />
      <select v-model="statusFilter" class="filter-select" @change="fetchUsers">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <select v-model="roleFilter" class="filter-select" @change="fetchUsers">
        <option value="">All roles</option>
        <option value="user">User</option>
        <option value="superuser">Superuser</option>
      </select>
      <button class="search-btn" @click="fetchUsers">Search</button>
    </div>

    <div class="table-header" aria-hidden="true">
      <span>Email / Name</span>
      <span>Status</span>
      <span>Role</span>
      <span>Joined</span>
      <span></span>
    </div>

    <div v-if="store.loading && !store.users.length" class="loading"><PourLoader /></div>

    <AdminUserRow
      v-for="user in store.users"
      :key="user.id"
      :user="user"
      :is-expanded="store.expandedUserId === user.id"
      :stats="store.userStats[user.id] ?? null"
      :stats-loading="!!store.statsLoading[user.id]"
      @toggle="store.expandUser(user.id)"
      @update="(id, data) => store.updateUser(id, data)"
      @delete="store.deleteUser"
    />

    <div class="pagination">
      <span class="count">{{ store.users.length }} user{{ store.users.length !== 1 ? 's' : '' }} loaded</span>
      <button v-if="store.hasMore" class="load-more" :disabled="store.loading" @click="store.loadMore">
        Load more
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.search-input {
  flex: 1; min-width: 180px; background: var(--color-surface-2); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: 6px 10px; color: var(--color-text); font-size: 13px;
}
.filter-select {
  background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 6px 8px; color: var(--color-text-muted); font-size: 12px;
}
.search-btn {
  background: var(--color-accent); color: var(--color-primary-ink); border: none; border-radius: var(--radius-sm);
  padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.table-header {
  display: grid; grid-template-columns: 2fr 1fr 1fr 100px 50px;
  gap: 8px; padding: 5px 12px; background: var(--color-surface);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0; font-size: 11px; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
}

@media (max-width: 767px) {
  /* Rows collapse to stacked cards below; the grid header no longer applies. */
  .table-header { display: none; }
}
.loading { padding: 20px; color: var(--color-text-muted); text-align: center; }
.pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.count { font-size: 12px; color: var(--color-text-muted); }
.load-more {
  background: var(--color-surface-2); color: var(--color-accent); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: 5px 12px; font-size: 12px; cursor: pointer;
}
</style>
