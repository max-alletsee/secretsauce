<!-- frontend/src/views/ShoppingListView.vue -->
<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useShoppingListStore } from '@/stores/useShoppingListStore'
import PourLoader from '@/components/base/PourLoader.vue'
import ProgressBar from '@/components/base/ProgressBar.vue'
import ToggleChip from '@/components/base/ToggleChip.vue'

const CATEGORY_ORDER = [
  'Fresh Fruits and Vegetables',
  'Cooled Products, Milk Products',
  'Tinned Products',
  'Sauces, Herbs, Spices, Oils',
  'Broth, sauces, readymade products',
  'Baked products',
  'Spreads for Bread',
  'Deep-frozen products',
  'Coffee and Tea',
  'Cereals, Cornflakes, Müsli',
  'Basic Ingredients for Cooking and Baking',
  'Meat and Fish',
  'Drinks',
  'Sweets and Snacks',
] as const

const route = useRoute()
const store = useShoppingListStore()
const listId = String(route.params.id)

onMounted(() => store.fetchList(listId))

const hideChecked = ref(false)

const checkedCount = computed(
  () => store.list?.items.filter((item) => item.checked).length ?? 0,
)
const totalCount = computed(() => store.list?.items.length ?? 0)

const groupedItems = computed(() => {
  if (!store.list) return []
  const visibleItems = hideChecked.value
    ? store.list.items.filter((item) => !item.checked)
    : store.list.items
  const byCategory: Record<string, typeof store.list.items> = {}
  for (const item of visibleItems) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category]!.push(item)
  }
  return CATEGORY_ORDER
    .filter((cat) => byCategory[cat]?.length)
    .map((cat) => ({
      category: cat,
      items: [...(byCategory[cat] ?? [])].sort((a, b) => {
        if (a.checked === b.checked) return 0
        return a.checked ? 1 : -1
      }),
    }))
})

async function handleToggle(itemId: string, currentChecked: boolean) {
  await store.toggleItem(listId, itemId, !currentChecked)
}

async function handleClearChecked() {
  const checkedItems = store.list?.items.filter((item) => item.checked) ?? []
  await Promise.all(checkedItems.map((item) => store.toggleItem(listId, item.id, false)))
}

function formatQty(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

async function handleRegenerate() {
  await store.regenerate(listId)
}
</script>

<template>
  <div class="shopping-view">
    <div v-if="store.loading" class="loading"><PourLoader /></div>

    <template v-else-if="store.list">
      <header class="shopping-header">
        <h1 class="plan-name">{{ store.list.name }}</h1>
        <button
          class="btn-regenerate"
          :disabled="store.regenerating"
          @click="handleRegenerate"
        >
          {{ store.regenerating ? 'Generating…' : 'Regenerate' }}
        </button>
      </header>

      <div v-if="store.list.items.length === 0 && !store.regenerating" class="empty-state">
        <p>No items yet. Click <strong>Regenerate</strong> to build your shopping list.</p>
      </div>

      <template v-else>
        <div class="progress-header">
          <div class="progress-header__row">
            <span class="progress-header__count">{{ checkedCount }} / {{ totalCount }} checked</span>
            <ToggleChip
              v-model="hideChecked"
              data-testid="hide-checked-toggle"
              label="Hide checked"
            />
            <button
              type="button"
              class="clear-checked-button"
              data-testid="clear-checked-button"
              :disabled="checkedCount === 0"
              @click="handleClearChecked"
            >
              Clear checked
            </button>
          </div>
          <ProgressBar :value="checkedCount" :max="totalCount" />
        </div>

        <div class="category-list">
          <section
            v-for="group in groupedItems"
            :key="group.category"
            class="category-section"
          >
            <h2 class="category-title">{{ group.category }}</h2>
            <ul class="item-list">
              <li
                v-for="item in group.items"
                :key="item.id"
                class="item-row"
                :class="{ 'item-checked': item.checked }"
              >
                <label class="item-label">
                  <input
                    type="checkbox"
                    :checked="item.checked"
                    class="item-checkbox"
                    @change="handleToggle(item.id, item.checked)"
                  />
                  <span class="item-content">
                    <span class="item-name">
                      {{ item.ingredient_name }}
                      <span class="item-quantity">
                        {{ formatQty(item.total_quantity) }}
                        {{ item.unit }}
                      </span>
                    </span>
                    <span v-if="item.detail" class="item-detail">{{ item.detail }}</span>
                  </span>
                </label>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.shopping-view {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
}

.shopping-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.plan-name {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.btn-regenerate {
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
}

.btn-regenerate:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.progress-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 0 var(--space-5);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.progress-header__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.progress-header__count {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
}

.clear-checked-button {
  margin-left: auto;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.clear-checked-button:hover:not(:disabled) {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.clear-checked-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.clear-checked-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  color: #888;
  padding: 3rem 1rem;
}

.category-section {
  margin-bottom: 1.5rem;
}

.category-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #666;
  margin: 0 0 0.4rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #e0e0e0;
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item-row {
  border-bottom: 1px solid #f0f0f0;
}

.item-label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0;
  cursor: pointer;
  min-height: 48px;
}

.item-checkbox {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 2px;
  cursor: pointer;
  accent-color: #2ecc71;
}

.item-content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.item-name {
  font-size: 1rem;
  line-height: 1.4;
}

.item-quantity {
  font-weight: 600;
  margin-left: 0.4rem;
}

.item-detail {
  font-size: 0.8rem;
  color: #888;
}

.item-checked .item-name {
  text-decoration: line-through;
  color: #bbb;
}

.item-checked .item-detail {
  color: #ccc;
}

.loading {
  text-align: center;
  color: #888;
  padding: 2rem;
}

@media (min-width: 768px) {
  .shopping-view {
    padding: 1.5rem;
  }
}
</style>
