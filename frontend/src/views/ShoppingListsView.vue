<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as shoppingApi from '@/api/shoppingLists'
import type { ShoppingListSummary } from '@/types/shoppingList'

const router = useRouter()

const lists = ref<ShoppingListSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await shoppingApi.listShoppingLists()
    lists.value = data
  } catch {
    error.value = 'Failed to load shopping lists.'
  } finally {
    loading.value = false
  }
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCreated(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function listDateRange(list: ShoppingListSummary): string {
  if (list.from_date && list.to_date) {
    return `${formatDate(list.from_date)} – ${formatDate(list.to_date)}`
  }
  if (list.from_date) return `From ${formatDate(list.from_date)}`
  return `Created ${formatCreated(list.created_at)}`
}
</script>

<template>
  <div class="lists-view">
    <header class="lists-header">
      <h1 class="lists-title">Shopping Lists</h1>
      <router-link to="/shopping-lists/new" class="btn-new">+ New list</router-link>
    </header>

    <div v-if="loading" class="loading">Loading…</div>

    <p v-else-if="error" class="error-msg">{{ error }}</p>

    <template v-else-if="lists.length === 0">
      <div class="empty-state">
        <p>No shopping lists yet.</p>
        <router-link to="/shopping-lists/new" class="btn-new">Create your first list</router-link>
      </div>
    </template>

    <ul v-else class="list-cards">
      <li
        v-for="list in lists"
        :key="list.id"
        class="list-card"
        @click="router.push(`/shopping-lists/${list.id}`)"
      >
        <span class="list-name">{{ list.name }}</span>
        <span class="list-meta">{{ listDateRange(list) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lists-view {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
}

.lists-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.lists-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.btn-new {
  padding: 0.45rem 1rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.btn-new:hover {
  background: #1d4ed8;
}

.loading {
  text-align: center;
  color: #888;
  padding: 2rem;
}

.error-msg {
  color: #dc2626;
  font-size: 0.9rem;
}

.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 3rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.list-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.list-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  background: white;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-height: 56px;
}

.list-card:hover {
  border-color: #2563eb;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.1);
}

.list-name {
  font-size: 1rem;
  font-weight: 500;
}

.list-meta {
  font-size: 0.8rem;
  color: #9ca3af;
  white-space: nowrap;
  margin-left: 0.5rem;
}

@media (min-width: 768px) {
  .lists-view {
    padding: 1.5rem;
  }
}
</style>
