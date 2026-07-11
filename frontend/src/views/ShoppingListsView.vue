<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as shoppingApi from '@/api/shoppingLists'
import type { ShoppingListSummary } from '@/types/shoppingList'
import PourLoader from '@/components/base/PourLoader.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import ProgressBar from '@/components/base/ProgressBar.vue'
import EmptyState from '@/components/base/EmptyState.vue'

const router = useRouter()

const lists = ref<ShoppingListSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Per-list checked/total item counts, keyed by list id. Fetched individually
// after the summary list loads, since the index payload has no counts.
// A missing entry means the detail fetch hasn't resolved (or failed) —
// the card still renders name/date without a progress bar in that case.
const progress = ref<Record<string, { checked: number; total: number }>>({})

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

  await Promise.all(
    lists.value.map(async (list) => {
      try {
        const { data } = await shoppingApi.getShoppingList(list.id)
        progress.value[list.id] = {
          checked: data.items.filter((item) => item.checked).length,
          total: data.items.length,
        }
      } catch {
        // Leave this card without progress info; count/plan still render.
      }
    }),
  )
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
      <BaseButton variant="primary" @click="router.push('/shopping-lists/new')">
        + New list
      </BaseButton>
    </header>

    <div v-if="loading" class="loading"><PourLoader /></div>

    <p v-else-if="error" class="error-msg">{{ error }}</p>

    <EmptyState
      v-else-if="lists.length === 0"
      title="No shopping lists yet"
      class="lists-empty"
    >
      <template #action>
        <BaseButton variant="primary" @click="router.push('/shopping-lists/new')">
          Create your first list
        </BaseButton>
      </template>
    </EmptyState>

    <ul v-else class="list-cards">
      <li v-for="list in lists" :key="list.id">
        <BaseCard
          class="list-card"
          role="button"
          tabindex="0"
          @click="router.push(`/shopping-lists/${list.id}`)"
          @keydown.enter="router.push(`/shopping-lists/${list.id}`)"
        >
          <div class="list-card__top">
            <span class="list-name">{{ list.name }}</span>
            <span class="list-meta">{{ listDateRange(list) }}</span>
          </div>

          <div v-if="progress[list.id]" class="list-card__status">
            <div class="list-card__progress">
              <ProgressBar
                :value="progress[list.id]!.checked"
                :max="progress[list.id]!.total"
              />
            </div>
            <span class="list-count">
              {{ progress[list.id]!.checked }} / {{ progress[list.id]!.total }} checked
            </span>
          </div>
        </BaseCard>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lists-view {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-4);
}

.lists-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-5);
}

.lists-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  margin: 0;
}

.loading {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-6);
}

.error-msg {
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.lists-empty {
  padding: var(--space-8) var(--space-4);
}

.list-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.list-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  cursor: pointer;
  transition: box-shadow 0.15s ease;
  min-height: 56px;
}

.list-card:hover,
.list-card:focus-visible {
  box-shadow: var(--shadow);
}

.list-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.list-name {
  font-size: var(--text-base);
  font-weight: 500;
}

.list-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
  margin-left: var(--space-2);
}

.list-card__status {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.list-card__progress {
  flex: 1;
}

.list-count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

@media (min-width: 768px) {
  .lists-view {
    padding: var(--space-5);
  }
}
</style>
