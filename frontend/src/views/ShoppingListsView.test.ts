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
})
