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
const addItem = vi.fn()
const updateItemQuantity = vi.fn()

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
    addItem,
    updateItemQuantity,
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
    addItem.mockResolvedValue(undefined)
    updateItemQuantity.mockResolvedValue(undefined)
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

  describe('regenerate overflow menu', () => {
    it('does not show the regenerate menu item until the overflow trigger is opened', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      expect(wrapper.find('[data-testid="regenerate-menu-item"]').exists()).toBe(false)
    })

    it('opens the overflow menu and shows the Regenerate menu item', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      const trigger = wrapper.find('[aria-label="More actions"]')
      expect(trigger.exists()).toBe(true)
      await trigger.trigger('click')

      const menuItem = wrapper.find('[data-testid="regenerate-menu-item"]')
      expect(menuItem.exists()).toBe(true)
      expect(menuItem.text()).toBe('Regenerate')
    })

    it('shows "Generating…" and disables the menu item while store.regenerating is true', async () => {
      mockStore({ list: makeList([makeItem()]), regenerating: true })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      const menuItem = wrapper.find('[data-testid="regenerate-menu-item"]')
      expect(menuItem.text()).toBe('Generating…')
      expect(menuItem.attributes('disabled')).toBeDefined()
    })

    it('clicking the menu item closes the menu and opens the ConfirmDialog instead of calling store.regenerate directly', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await wrapper.find('[data-testid="regenerate-menu-item"]').trigger('click')
      await wrapper.vm.$nextTick()

      // Menu should be closed now.
      expect(wrapper.find('[data-testid="regenerate-menu-item"]').exists()).toBe(false)

      const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      expect(dialog.exists()).toBe(true)
      expect(dialog.props('open')).toBe(true)

      expect(regenerate).not.toHaveBeenCalled()
    })

    it('confirming the dialog calls store.regenerate(listId)', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await wrapper.find('[data-testid="regenerate-menu-item"]').trigger('click')
      await wrapper.vm.$nextTick()

      const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      dialog.vm.$emit('confirm')
      await flushPromises()

      expect(regenerate).toHaveBeenCalledWith('list-1')
    })

    it('cancelling the dialog closes it without calling store.regenerate', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await wrapper.find('[data-testid="regenerate-menu-item"]').trigger('click')
      await wrapper.vm.$nextTick()

      let dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      expect(dialog.props('open')).toBe(true)

      dialog.vm.$emit('cancel')
      await wrapper.vm.$nextTick()

      dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      expect(dialog.props('open')).toBe(false)
      expect(regenerate).not.toHaveBeenCalled()
    })

    it('Escape closes the overflow menu and returns focus to the trigger', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView, { attachTo: document.body })
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      expect(wrapper.find('[data-testid="regenerate-menu-item"]').exists()).toBe(true)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="regenerate-menu-item"]').exists()).toBe(false)
      expect(document.activeElement?.getAttribute('aria-label')).toBe('More actions')

      wrapper.unmount()
    })

    it('outside pointerdown closes the overflow menu', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView, { attachTo: document.body })
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      expect(wrapper.find('[data-testid="regenerate-menu-item"]').exists()).toBe(true)

      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="regenerate-menu-item"]').exists()).toBe(false)

      wrapper.unmount()
    })

    it('does not leak document listeners after unmount', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView, { attachTo: document.body })
      await flushPromises()

      await wrapper.find('[aria-label="More actions"]').trigger('click')
      wrapper.unmount()

      // Should not throw and should not affect anything now that the component is gone.
      expect(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      }).not.toThrow()
    })
  })

  it('item toggling still works (no regression)', async () => {
    mockStore({ list: makeList([makeItem({ id: 'i1', checked: false })]) })
    const wrapper = mount(ShoppingListView)
    await flushPromises()

    await wrapper.find('.item-checkbox').trigger('change')
    expect(toggleItem).toHaveBeenCalledWith('list-1', 'i1', true)
  })

  describe('add item', () => {
    it('calls the store method with the entered values and clears the input on success', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      const nameInput = wrapper.find('[data-testid="add-item-name-input"]')
      expect(nameInput.exists()).toBe(true)
      await nameInput.setValue('napkins')

      await wrapper.find('[data-testid="add-item-form"]').trigger('submit')
      await flushPromises()

      expect(addItem).toHaveBeenCalledWith('list-1', 'napkins', 1, '')
      expect((nameInput.element as HTMLInputElement).value).toBe('')
    })

    it('does not call the store when the name is blank', async () => {
      mockStore({ list: makeList([makeItem()]) })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[data-testid="add-item-form"]').trigger('submit')
      await flushPromises()

      expect(addItem).not.toHaveBeenCalled()
    })
  })

  describe('inline quantity edit', () => {
    it('turns into an input on click and saves via the update method on Enter', async () => {
      mockStore({
        list: makeList([makeItem({ id: 'i1', total_quantity: 200, unit: 'g' })]),
      })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      const qtyDisplay = wrapper.find('[data-testid="item-quantity-i1"]')
      expect(qtyDisplay.exists()).toBe(true)
      await qtyDisplay.trigger('click')

      const qtyInput = wrapper.find('[data-testid="item-quantity-input-i1"] input')
      expect(qtyInput.exists()).toBe(true)
      await qtyInput.setValue('5')
      await qtyInput.trigger('keydown.enter')
      await flushPromises()

      expect(updateItemQuantity).toHaveBeenCalledWith('list-1', 'i1', 5, 'g')
    })

    it('saves via the update method on blur', async () => {
      mockStore({
        list: makeList([makeItem({ id: 'i1', total_quantity: 200, unit: 'g' })]),
      })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[data-testid="item-quantity-i1"]').trigger('click')
      const qtyInput = wrapper.find('[data-testid="item-quantity-input-i1"] input')
      await qtyInput.setValue('7')
      await qtyInput.trigger('blur')
      await flushPromises()

      expect(updateItemQuantity).toHaveBeenCalledWith('list-1', 'i1', 7, 'g')
    })

    it('Escape cancels without calling the API', async () => {
      mockStore({
        list: makeList([makeItem({ id: 'i1', total_quantity: 200, unit: 'g' })]),
      })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[data-testid="item-quantity-i1"]').trigger('click')
      const qtyInput = wrapper.find('[data-testid="item-quantity-input-i1"] input')
      await qtyInput.setValue('99')
      await qtyInput.trigger('keydown.esc')
      await flushPromises()

      expect(updateItemQuantity).not.toHaveBeenCalled()
      // Reverted back to display mode showing the original value.
      expect(wrapper.find('[data-testid="item-quantity-i1"]').exists()).toBe(true)
    })

    it('blurring without a changed value does not call the API', async () => {
      mockStore({
        list: makeList([makeItem({ id: 'i1', total_quantity: 200, unit: 'g' })]),
      })
      const wrapper = mount(ShoppingListView)
      await flushPromises()

      await wrapper.find('[data-testid="item-quantity-i1"]').trigger('click')
      const qtyInput = wrapper.find('[data-testid="item-quantity-input-i1"] input')
      await qtyInput.trigger('blur')
      await flushPromises()

      expect(updateItemQuantity).not.toHaveBeenCalled()
    })
  })
})
