// frontend/src/views/ShoppingListsView.test.ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/api/shoppingLists', () => ({
  listShoppingLists: vi.fn(),
  getShoppingList: vi.fn(),
  deleteShoppingList: vi.fn(),
}))

const mockToastShow = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ show: mockToastShow }),
}))

import * as shoppingApi from '@/api/shoppingLists'
import ShoppingListsView from './ShoppingListsView.vue'

function makeSummary(overrides: Partial<{
  id: string
  name: string
  from_date: string | null
  to_date: string | null
  created_at: string
}> = {}) {
  return {
    id: 'list-1',
    name: 'Week 1 groceries',
    from_date: '2026-07-01',
    to_date: '2026-07-07',
    created_at: '2026-06-30T12:00:00Z',
    ...overrides,
  }
}

function makeDetail(id: string, checkedCount: number, totalCount: number) {
  const items = Array.from({ length: totalCount }, (_, i) => ({
    id: `item-${i}`,
    shopping_list_id: id,
    ingredient_name: `Ingredient ${i}`,
    total_quantity: 1,
    unit: 'pc',
    detail: '',
    category: 'Misc',
    recipe_ids: [],
    checked: i < checkedCount,
    created_at: '2026-06-30T12:00:00Z',
  }))
  return {
    id,
    user_id: 'user-1',
    meal_plan_id: 'plan-1',
    name: 'Week 1 groceries',
    items,
    created_at: '2026-06-30T12:00:00Z',
    updated_at: '2026-06-30T12:00:00Z',
  }
}

describe('ShoppingListsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountWithOneList() {
    vi.mocked(shoppingApi.listShoppingLists).mockResolvedValue({
      data: [makeSummary()],
    } as never)
    vi.mocked(shoppingApi.getShoppingList).mockResolvedValue({
      data: makeDetail('list-1', 2, 5),
    } as never)

    const wrapper = mount(ShoppingListsView)
    await flushPromises()
    return wrapper
  }

  it('shows the empty state when there are no lists', async () => {
    vi.mocked(shoppingApi.listShoppingLists).mockResolvedValue({ data: [] } as never)

    const wrapper = mount(ShoppingListsView)
    await flushPromises()

    expect(wrapper.text()).toContain('No shopping lists yet')
  })

  it('shows an error message when the summary fetch fails', async () => {
    vi.mocked(shoppingApi.listShoppingLists).mockRejectedValue(new Error('boom'))

    const wrapper = mount(ShoppingListsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to load shopping lists.')
  })

  it('renders card name, date range, item count and a progress bar once detail resolves', async () => {
    vi.mocked(shoppingApi.listShoppingLists).mockResolvedValue({
      data: [makeSummary()],
    } as never)
    vi.mocked(shoppingApi.getShoppingList).mockResolvedValue({
      data: makeDetail('list-1', 2, 5),
    } as never)

    const wrapper = mount(ShoppingListsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Week 1 groceries')
    expect(wrapper.text()).toContain('2 / 5 checked')

    const progressBar = wrapper.find('[role="progressbar"]')
    expect(progressBar.exists()).toBe(true)
    expect(progressBar.attributes('aria-valuenow')).toBe('2')
    expect(progressBar.attributes('aria-valuemax')).toBe('5')
  })

  it('still renders the card without a progress bar when the per-list detail fetch fails', async () => {
    vi.mocked(shoppingApi.listShoppingLists).mockResolvedValue({
      data: [makeSummary({ id: 'list-2', name: 'Broken list' })],
    } as never)
    vi.mocked(shoppingApi.getShoppingList).mockRejectedValue(new Error('nope'))

    const wrapper = mount(ShoppingListsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Broken list')
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })

  it('navigates to the list detail page when a card is clicked', async () => {
    vi.mocked(shoppingApi.listShoppingLists).mockResolvedValue({
      data: [makeSummary()],
    } as never)
    vi.mocked(shoppingApi.getShoppingList).mockResolvedValue({
      data: makeDetail('list-1', 1, 3),
    } as never)

    const wrapper = mount(ShoppingListsView)
    await flushPromises()

    await wrapper.find('.list-card').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/shopping-lists/list-1')
  })

  it('opens delete confirmation from the overflow menu, keyboard-operable without touch', async () => {
    const wrapper = await mountWithOneList()

    const menuTrigger = wrapper.find('[aria-label="More actions"]')
    expect(menuTrigger.exists()).toBe(true)
    await menuTrigger.trigger('click')

    const menu = wrapper.find('[role="menu"]')
    expect(menu.exists()).toBe(true)

    const deleteItem = wrapper.find('[role="menuitem"]')
    expect(deleteItem.exists()).toBe(true)
    await deleteItem.trigger('click')

    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('title')).toBe('Delete list?')
  })

  it('confirming overflow delete calls the delete API, removes the card, and shows a toast', async () => {
    vi.mocked(shoppingApi.deleteShoppingList).mockResolvedValue({ data: undefined } as never)
    const wrapper = await mountWithOneList()

    await wrapper.find('[aria-label="More actions"]').trigger('click')
    await wrapper.find('[role="menuitem"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    dialog.vm.$emit('confirm')
    await flushPromises()

    expect(shoppingApi.deleteShoppingList).toHaveBeenCalledWith('list-1')
    expect(wrapper.find('.list-card').exists()).toBe(false)
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    )
    const toastArg = mockToastShow.mock.calls[0]![0]
    expect(toastArg.undoLabel).toBeUndefined()
    expect(toastArg.onUndo).toBeUndefined()
  })

  it('cancelling the confirm dialog leaves the list intact and does not call the API', async () => {
    const wrapper = await mountWithOneList()

    await wrapper.find('[aria-label="More actions"]').trigger('click')
    await wrapper.find('[role="menuitem"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    dialog.vm.$emit('cancel')
    await flushPromises()

    expect(shoppingApi.deleteShoppingList).not.toHaveBeenCalled()
    expect(wrapper.find('.list-card').exists()).toBe(true)
  })

  it('swiping past the threshold reveals a delete affordance that routes through the same confirm dialog', async () => {
    const wrapper = await mountWithOneList()

    const swipeArea = wrapper.find('.list-card-swipe')
    expect(swipeArea.exists()).toBe(true)

    await swipeArea.trigger('touchstart', { touches: [{ clientX: 300, clientY: 10 }] })
    await swipeArea.trigger('touchmove', { touches: [{ clientX: 100, clientY: 10 }] })
    await swipeArea.trigger('touchend')

    const swipeDelete = wrapper.find('[data-testid="swipe-delete"]')
    expect(swipeDelete.exists()).toBe(true)

    await swipeDelete.trigger('click')

    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('title')).toBe('Delete list?')
  })

  it('a small swipe under the threshold does not reveal the delete affordance', async () => {
    const wrapper = await mountWithOneList()

    const swipeArea = wrapper.find('.list-card-swipe')
    await swipeArea.trigger('touchstart', { touches: [{ clientX: 300, clientY: 10 }] })
    await swipeArea.trigger('touchmove', { touches: [{ clientX: 280, clientY: 10 }] })
    await swipeArea.trigger('touchend')

    expect(wrapper.find('[data-testid="swipe-delete"]').exists()).toBe(false)
  })

  it('shows an inline error and keeps the card when delete fails', async () => {
    vi.mocked(shoppingApi.deleteShoppingList).mockRejectedValue(new Error('boom'))
    const wrapper = await mountWithOneList()

    await wrapper.find('[aria-label="More actions"]').trigger('click')
    await wrapper.find('[role="menuitem"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    dialog.vm.$emit('confirm')
    await flushPromises()

    expect(wrapper.find('.list-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('Failed to delete')
  })
})
