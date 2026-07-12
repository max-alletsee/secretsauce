<!-- frontend/src/views/ShoppingListView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { EllipsisVertical } from '@lucide/vue'
import { useShoppingListStore } from '@/stores/useShoppingListStore'
import PourLoader from '@/components/base/PourLoader.vue'
import ProgressBar from '@/components/base/ProgressBar.vue'
import ToggleChip from '@/components/base/ToggleChip.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import IconButton from '@/components/base/IconButton.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'

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

// ── Overflow menu (Regenerate) ──────────────────────────────────────────────
// Mirrors the hand-rolled overflow-menu pattern in RecipeDetailView.vue:
// outside-click and Escape both close the menu, and the document listeners
// are only attached while the menu is actually open.

const menuOpen = ref(false)
const confirmingRegenerate = ref(false)
const menuTriggerRef = ref<InstanceType<typeof IconButton> | null>(null)
const menuRootRef = ref<HTMLElement | null>(null)

function focusMenuTrigger() {
  ;(menuTriggerRef.value?.$el as HTMLElement | undefined)?.focus()
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function closeMenu() {
  menuOpen.value = false
}

function handleRegenerateMenuItem() {
  closeMenu()
  confirmingRegenerate.value = true
}

async function confirmRegenerate() {
  confirmingRegenerate.value = false
  await handleRegenerate()
}

function cancelRegenerate() {
  confirmingRegenerate.value = false
}

function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && menuOpen.value) {
    closeMenu()
    focusMenuTrigger()
  }
}

function onDocumentPointerdown(e: PointerEvent) {
  if (!menuOpen.value) return
  const root = menuRootRef.value
  if (root && !root.contains(e.target as Node)) {
    closeMenu()
  }
}

watch(menuOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onDocumentKeydown)
    document.addEventListener('pointerdown', onDocumentPointerdown)
  } else {
    document.removeEventListener('keydown', onDocumentKeydown)
    document.removeEventListener('pointerdown', onDocumentPointerdown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerdown)
})

// ── Add ad-hoc item ─────────────────────────────────────────────────────────

const newItemName = ref('')

async function handleAddItem() {
  const name = newItemName.value.trim()
  if (!name) return
  await store.addItem(listId, name, 1, '')
  newItemName.value = ''
}

// ── Inline quantity edit ────────────────────────────────────────────────────

const editingItemId = ref<string | null>(null)
const editingValue = ref('')
let editingCancelled = false

function startEditingQuantity(itemId: string, currentQuantity: number) {
  editingItemId.value = itemId
  editingValue.value = formatQty(currentQuantity)
  editingCancelled = false
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>(
      `[data-testid="item-quantity-input-${itemId}"] input`,
    )
    el?.focus()
    el?.select()
  })
}

async function commitEditingQuantity(itemId: string, unit: string, originalQuantity: number) {
  if (editingItemId.value !== itemId) return
  if (editingCancelled) {
    editingCancelled = false
    editingItemId.value = null
    return
  }

  const parsed = Number(editingValue.value)
  editingItemId.value = null

  if (!Number.isFinite(parsed) || parsed === originalQuantity) return

  await store.updateItemQuantity(listId, itemId, parsed, unit)
}

function cancelEditingQuantity() {
  editingCancelled = true
  editingItemId.value = null
}
</script>

<template>
  <div class="shopping-view">
    <div v-if="store.loading" class="loading"><PourLoader /></div>

    <template v-else-if="store.list">
      <header class="shopping-header">
        <h1 class="plan-name">{{ store.list.name }}</h1>

        <div ref="menuRootRef" class="shopping-header__overflow">
          <IconButton
            ref="menuTriggerRef"
            :icon="EllipsisVertical"
            label="More actions"
            variant="ghost"
            aria-haspopup="menu"
            :aria-expanded="menuOpen ? 'true' : 'false'"
            @click="toggleMenu"
          />
          <ul v-if="menuOpen" role="menu" class="shopping-header__overflow-list">
            <li role="none">
              <button
                type="button"
                role="menuitem"
                data-testid="regenerate-menu-item"
                class="shopping-header__overflow-action"
                :disabled="store.regenerating"
                @click="handleRegenerateMenuItem"
              >
                {{ store.regenerating ? 'Generating…' : 'Regenerate' }}
              </button>
            </li>
          </ul>
        </div>
      </header>

      <ConfirmDialog
        :open="confirmingRegenerate"
        title="Regenerate shopping list?"
        message="This rebuilds the list from your meal plan's recipes. Manually added items, quantity edits, and checked-off progress may be lost."
        confirm-label="Regenerate"
        @confirm="confirmRegenerate"
        @cancel="cancelRegenerate"
      />

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

        <form
          class="add-item-form"
          data-testid="add-item-form"
          @submit.prevent="handleAddItem"
        >
          <BaseInput
            v-model="newItemName"
            data-testid="add-item-name-input"
            placeholder="Add item…"
            aria-label="Ingredient name"
          />
          <button type="submit" class="add-item-button">+ Add item</button>
        </form>

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
                      <span
                        v-if="editingItemId !== item.id"
                        class="item-quantity"
                        :data-testid="`item-quantity-${item.id}`"
                        tabindex="0"
                        role="button"
                        :aria-label="`Edit quantity for ${item.ingredient_name}`"
                        @click.prevent.stop="startEditingQuantity(item.id, item.total_quantity)"
                        @keydown.enter.prevent.stop="startEditingQuantity(item.id, item.total_quantity)"
                      >
                        {{ formatQty(item.total_quantity) }}
                        {{ item.unit }}
                      </span>
                      <span
                        v-else
                        class="item-quantity-edit"
                        :data-testid="`item-quantity-input-${item.id}`"
                        @click.prevent.stop
                      >
                        <BaseInput
                          v-model="editingValue"
                          type="number"
                          :aria-label="`Quantity for ${item.ingredient_name}`"
                          @keydown.enter="commitEditingQuantity(item.id, item.unit, item.total_quantity)"
                          @keydown.esc="cancelEditingQuantity"
                          @blur="commitEditingQuantity(item.id, item.unit, item.total_quantity)"
                        />
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

.shopping-header__overflow {
  position: relative;
  display: inline-flex;
}

.shopping-header__overflow-list {
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

.shopping-header__overflow-action {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text);
  text-decoration: none;
  white-space: nowrap;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
}

.shopping-header__overflow-action:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.shopping-header__overflow-action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.shopping-header__overflow-action:disabled {
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

.add-item-form {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0 0 var(--space-5);
}

.add-item-form :deep(.input-wrapper) {
  flex: 1;
}

.add-item-button {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-4);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s ease;
  /* Match BaseInput's height so the row aligns. */
  height: 2.375rem;
}

.add-item-button:hover {
  filter: brightness(0.92);
}

.add-item-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
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
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
  cursor: pointer;
}

.item-quantity:hover {
  background: var(--color-surface-2);
}

.item-quantity:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.item-quantity-edit {
  display: inline-block;
  width: 5.5rem;
  margin-left: 0.4rem;
  vertical-align: middle;
}

.item-quantity-edit :deep(.input) {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
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
