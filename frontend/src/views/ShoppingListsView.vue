<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { EllipsisVertical, Trash2 } from '@lucide/vue'
import * as shoppingApi from '@/api/shoppingLists'
import type { ShoppingListSummary } from '@/types/shoppingList'
import { useToast } from '@/composables/useToast'
import PourLoader from '@/components/base/PourLoader.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import IconButton from '@/components/base/IconButton.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import ProgressBar from '@/components/base/ProgressBar.vue'
import EmptyState from '@/components/base/EmptyState.vue'

const router = useRouter()
const toast = useToast()

const lists = ref<ShoppingListSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Delete flow — shared by both entry points (overflow menu and swipe gesture).
// Only one card's menu/swipe-reveal is open at a time, tracked by list id.
const menuOpenId = ref<string | null>(null)
const confirmingDeleteId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const deleteErrorId = ref<string | null>(null)

// Swipe gesture state — keyed by list id so multiple cards don't interfere.
const swipeRevealedId = ref<string | null>(null)
const swipeStartX = ref<number | null>(null)
const swipeDeltaX = ref(0)
const SWIPE_THRESHOLD = 64

function toggleMenu(id: string) {
  menuOpenId.value = menuOpenId.value === id ? null : id
}

function closeMenu() {
  menuOpenId.value = null
}

function requestDelete(id: string) {
  closeMenu()
  swipeRevealedId.value = null
  deleteErrorId.value = null
  confirmingDeleteId.value = id
}

async function confirmDelete() {
  const id = confirmingDeleteId.value
  if (!id) return
  confirmingDeleteId.value = null
  deletingId.value = id
  try {
    await shoppingApi.deleteShoppingList(id)
    lists.value = lists.value.filter((l) => l.id !== id)
    toast.show({ message: 'Shopping list deleted' })
  } catch {
    deleteErrorId.value = id
  } finally {
    deletingId.value = null
  }
}

function cancelDelete() {
  confirmingDeleteId.value = null
}

function onTouchStart(id: string, e: TouchEvent) {
  swipeStartX.value = e.touches[0]!.clientX
  swipeDeltaX.value = 0
  // Revealing a different card's swipe action closes any other open one.
  if (swipeRevealedId.value !== id) swipeRevealedId.value = null
}

function onTouchMove(e: TouchEvent) {
  if (swipeStartX.value === null) return
  const dx = e.touches[0]!.clientX - swipeStartX.value
  // Only track leftward drags (revealing a right-side delete affordance).
  swipeDeltaX.value = Math.min(0, dx)
}

function onTouchEnd(id: string) {
  if (-swipeDeltaX.value >= SWIPE_THRESHOLD) {
    swipeRevealedId.value = id
  } else {
    swipeRevealedId.value = null
  }
  swipeStartX.value = null
  swipeDeltaX.value = 0
}

function swipeCardStyle(id: string) {
  if (swipeStartX.value !== null && swipeDeltaX.value < 0) {
    return { transform: `translateX(${swipeDeltaX.value}px)` }
  }
  if (swipeRevealedId.value === id) {
    return { transform: 'translateX(-4.5rem)' }
  }
  return {}
}

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
      <li v-for="list in lists" :key="list.id" class="list-card-wrap">
        <button
          v-if="swipeRevealedId === list.id"
          type="button"
          data-testid="swipe-delete"
          class="list-card-swipe-action"
          aria-label="Delete list"
          @click="requestDelete(list.id)"
        >
          <Trash2 :size="20" />
        </button>

        <div
          class="list-card-swipe"
          :style="swipeCardStyle(list.id)"
          @touchstart="onTouchStart(list.id, $event)"
          @touchmove="onTouchMove($event)"
          @touchend="onTouchEnd(list.id)"
        >
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

              <div class="list-card__overflow" @click.stop @keydown.stop>
                <IconButton
                  :icon="EllipsisVertical"
                  label="More actions"
                  variant="ghost"
                  :size="16"
                  aria-haspopup="menu"
                  :aria-expanded="menuOpenId === list.id ? 'true' : 'false'"
                  @click="toggleMenu(list.id)"
                />
                <ul v-if="menuOpenId === list.id" role="menu" class="list-card__overflow-list">
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      class="list-card__overflow-action"
                      :disabled="deletingId === list.id"
                      @click="requestDelete(list.id)"
                    >
                      {{ deletingId === list.id ? 'Deleting…' : 'Delete' }}
                    </button>
                  </li>
                </ul>
              </div>
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

            <p v-if="deleteErrorId === list.id" class="list-card__error">
              Failed to delete list. Please try again.
            </p>
          </BaseCard>
        </div>
      </li>
    </ul>

    <ConfirmDialog
      :open="confirmingDeleteId !== null"
      title="Delete list?"
      message="This can't be undone."
      confirm-label="Yes, delete"
      danger
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
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

.list-card__overflow {
  position: relative;
  display: inline-flex;
  margin-left: auto;
}

.list-card__overflow-list {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  z-index: 200;
  min-width: 10rem;
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.list-card__overflow-action {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-danger);
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
}

.list-card__overflow-action:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.list-card__overflow-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.list-card__error {
  color: var(--color-danger);
  font-size: var(--text-xs);
  margin: 0;
}

/* Swipe-to-delete: the card sits above a fixed delete affordance and slides
   left on touch drag to reveal it. Desktop/AT users get the same delete
   action via the overflow menu above — this is a supplementary gesture. */
.list-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius);
}

.list-card-swipe-action {
  position: absolute;
  inset: 0 0 0 auto;
  width: 4.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--color-danger);
  color: var(--color-primary-ink);
  cursor: pointer;
}

.list-card-swipe {
  position: relative;
  transition: transform 0.2s ease;
  touch-action: pan-y;
}

@media (prefers-reduced-motion: reduce) {
  .list-card-swipe {
    transition: none;
  }
}

@media (min-width: 768px) {
  .lists-view {
    padding: var(--space-5);
  }
}
</style>
