// frontend/src/components/ShortlistPanel.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/mealPlans', () => ({
  getShortlist: vi.fn().mockResolvedValue({ data: [] }),
  addToShortlist: vi.fn(),
  removeFromShortlist: vi.fn().mockResolvedValue({ data: null }),
  reorderShortlist: vi.fn(),
}))

import ShortlistPanel from './ShortlistPanel.vue'
import type { ShortlistEntry } from '@/types/mealPlan'

const mockEntry: ShortlistEntry = {
  id: 's1',
  user_id: 'u1',
  recipe_id: null,
  note: 'Shakshuka',
  entry_type: 'suggestion',
  position: 0,
  created_at: '2026-04-07T00:00:00Z',
}

describe('ShortlistPanel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders shortlist entries', () => {
    const wrapper = mount(ShortlistPanel, {
      props: { entries: [mockEntry] },
    })
    expect(wrapper.text()).toContain('Shakshuka')
  })

  it('remove button emits remove event', async () => {
    const wrapper = mount(ShortlistPanel, {
      props: { entries: [mockEntry] },
    })
    await wrapper.find('[data-testid="remove-shortlist-s1"]').trigger('click')
    expect(wrapper.emitted('remove')?.[0]).toEqual(['s1'])
  })

  it('renders empty drop zone when no entries', () => {
    const wrapper = mount(ShortlistPanel, { props: { entries: [] } })
    expect(wrapper.find('[data-testid="shortlist-drop-zone"]').exists()).toBe(true)
  })
})
