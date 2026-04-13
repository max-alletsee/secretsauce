<!-- frontend/src/components/admin/AdminUserPicker.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import * as adminApi from '@/api/admin'
import type { AdminUser } from '@/types/admin'

const model = defineModel<string | null>({ default: null })

const query = ref('')
const results = ref<AdminUser[]>([])
const selectedEmail = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!val.trim()) { results.value = []; return }
  debounceTimer = setTimeout(async () => {
    const { data } = await adminApi.listUsers({ search: val, limit: 10 })
    results.value = data.items
  }, 250)
})

function select(user: AdminUser) {
  model.value = user.id
  selectedEmail.value = user.email
  query.value = ''
  results.value = []
}

function clear() {
  model.value = null
  selectedEmail.value = null
}
</script>

<template>
  <div class="user-picker">
    <div v-if="selectedEmail" class="selected-chip">
      {{ selectedEmail }}
      <button class="clear-btn" @click="clear">✕</button>
    </div>
    <div v-else class="search-wrapper">
      <input
        v-model="query"
        class="search-input"
        placeholder="Filter by user email…"
      />
      <ul v-if="results.length" class="dropdown">
        <li
          v-for="u in results"
          :key="u.id"
          class="dropdown-item"
          @click="select(u)"
        >
          {{ u.email }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.user-picker { position: relative; }
.selected-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: #1a2744; border: 1px solid #a78bfa;
  color: #a78bfa; border-radius: 4px; padding: 4px 8px; font-size: 12px;
}
.clear-btn { background: none; border: none; color: #a78bfa; cursor: pointer; font-size: 12px; }
.search-input {
  background: #1f2937; border: 1px solid #374151; border-radius: 4px;
  padding: 5px 8px; color: #e5e7eb; font-size: 12px; width: 220px;
}
.dropdown {
  position: absolute; top: 100%; left: 0; width: 100%; background: #1f2937;
  border: 1px solid #374151; border-radius: 4px; list-style: none; margin: 2px 0; padding: 0;
  z-index: 10;
}
.dropdown-item {
  padding: 7px 10px; font-size: 12px; color: #e5e7eb; cursor: pointer;
}
.dropdown-item:hover { background: #374151; }
</style>
