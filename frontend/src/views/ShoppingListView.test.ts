// frontend/src/views/ShoppingListView.test.ts
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShoppingList, ShoppingListItem } from '@/types/shoppingList'

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'list-1' } }),
}))

const fetchList = vi.fn()
const regenerate = vi.fn()
const toggleItem = vi.fn()

vi.mock('@/stores/useShoppingListStore', () => ({
  useShoppingListStore: vi.fn(),
}))

import { useShoppingListStore } from '@/stores/useShoppingListStore'
import ShoppingListView from './ShoppingListView.vue'

function makeItem(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'i1',
    shopping_list_id: 'list-1',
    ingredient_name: 'flour',
    total_quantity: 200,
    unit: 'g',
    detail: '200 g for Pizza Dough',
    category: 'Basic Ingredients for Cooking and Baking',
    recipe_ids: ['r1'],
    checked: false,
    created_at: '2026-04-09T00:00:00Z',
    ...overrides,
  }
}

function makeList(items: ShoppingListItem[]): ShoppingList {
  return {
    id: 'list-1',
    user_id: 'u1',
    meal_plan_id: 'mp1',
    name: 'Week Plan',
    items,
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-09T00:00:00Z',
  }
}

function mockStore(overrides: Record<string, unknown> = {}) {
  vi.mocked(useShoppingListStore).mockReturnValue({
    list: null,
    loading: false,
    regenerating: false,
    fetchList,
    regenerate,
    toggleItem,
    ...overrides,
  } as unknown as ReturnType<typeof useShoppingListStore>)
}

describe('ShoppingListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    fetchList.mockResolvedValue(undefined)
    regenerate.mockResolvedValue(undefined)
    toggleItem.mockResolvedValue(undefined)
  })

  it('shows the empty state when the list has no items', async () => {
    mockStore({ list: makeList([]) })
    const wrapper = mount(ShoppingListView)
    await flushPromises()
    expect(wrapper.text()).toContain('No items yet')
  })

  it('renders checked/total count and passes them to ProgressBar', async () => {
    mockStore({
      list: makeList([
        makeItem({ id: 'i1', checked: true }),
        makeItem({ id: 'i2', checked: false }),
        makeItem({ id: 'i3', checked: true }),
      ]),
    })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    expect(wrapper.text()).toContain('2 / 3 checked')
    const progressBar = wrapper.findComponent({ name: 'ProgressBar' })
    expect(progressBar.exists()).toBe(true)
    expect(progressBar.props('value')).toBe(2)
    expect(progressBar.props('max')).toBe(3)
  })

  it('keeps aisle/category grouping intact', async () => {
    mockStore({
      list: makeList([
        makeItem({ id: 'i1', category: 'Meat and Fish', ingredient_name: 'chicken' }),
        makeItem({ id: 'i2', category: 'Drinks', ingredient_name: 'juice' }),
      ]),
    })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    const titles = wrapper.findAll('.category-title').map((el) => el.text())
    expect(titles).toEqual(['Meat and Fish', 'Drinks'])
  })

  it('"Hide checked" filters checked items out of the rendered list without mutating the store', async () => {
    const list = makeList([
      makeItem({ id: 'i1', checked: true, ingredient_name: 'chicken' }),
      makeItem({ id: 'i2', checked: false, ingredient_name: 'juice' }),
    ])
    mockStore({ list })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    expect(wrapper.text()).toContain('chicken')
    expect(wrapper.text()).toContain('juice')

    const hideToggle = wrapper.find('[data-testid="hide-checked-toggle"]')
    expect(hideToggle.exists()).toBe(true)
    await hideToggle.trigger('click')

    expect(wrapper.text()).not.toContain('chicken')
    expect(wrapper.text()).toContain('juice')

    // The underlying store list must not be mutated by the view filter.
    expect(list.items).toHaveLength(2)
    expect(list.items.find((i) => i.id === 'i1')?.checked).toBe(true)
  })

  it('does not render an empty category section when all its items are hidden', async () => {
    const list = makeList([
      makeItem({ id: 'i1', checked: true, category: 'Meat and Fish', ingredient_name: 'chicken' }),
      makeItem({ id: 'i2', checked: false, category: 'Drinks', ingredient_name: 'juice' }),
    ])
    mockStore({ list })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    await wrapper.find('[data-testid="hide-checked-toggle"]').trigger('click')

    const titles = wrapper.findAll('.category-title').map((el) => el.text())
    expect(titles).toEqual(['Drinks'])
  })

  it('"Clear checked" calls the store\'s uncheck path for every checked item', async () => {
    const list = makeList([
      makeItem({ id: 'i1', checked: true }),
      makeItem({ id: 'i2', checked: false }),
      makeItem({ id: 'i3', checked: true }),
    ])
    mockStore({ list })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    const clearBtn = wrapper.find('[data-testid="clear-checked-button"]')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')
    await flushPromises()

    expect(toggleItem).toHaveBeenCalledTimes(2)
    expect(toggleItem).toHaveBeenCalledWith('list-1', 'i1', false)
    expect(toggleItem).toHaveBeenCalledWith('list-1', 'i3', false)
  })

  it('regenerate button still works (no regression)', async () => {
    mockStore({ list: makeList([makeItem()]) })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    await wrapper.find('.btn-regenerate').trigger('click')
    expect(regenerate).toHaveBeenCalledWith('list-1')
  })

  it('item toggling still works (no regression)', async () => {
    mockStore({ list: makeList([makeItem({ id: 'i1', checked: false })]) })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    await wrapper.find('.item-checkbox').trigger('change')
    expect(toggleItem).toHaveBeenCalledWith('list-1', 'i1', true)
  })
})
