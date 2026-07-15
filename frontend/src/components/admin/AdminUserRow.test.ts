// frontend/src/components/admin/AdminUserRow.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminUserRow from './AdminUserRow.vue'
import type { AdminUser, UserStats } from '@/types/admin'

const baseUser: AdminUser = {
  id: 'u1',
  email: 'test@example.com',
  display_name: null,
  is_active: true,
  is_superuser: false,
  is_verified: true,
  preferred_units: 'metric',
  ai_call_budget: 300,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
}

const stats: UserStats = {
  recipe_count: 1,
  meal_plan_count: 2,
  last_active: null,
  ai_calls_used: 12,
}

function mountRow(user: Partial<AdminUser> = {}) {
  return mount(AdminUserRow, {
    props: {
      user: { ...baseUser, ...user },
      isExpanded: true,
      stats,
      statsLoading: false,
    },
  })
}

describe('AdminUserRow — AI budget', () => {
  it('shows used/budget and a Remove button when a budget is set', () => {
    const wrapper = mountRow()
    expect(wrapper.find('[data-testid="ai-calls"]').text()).toBe('AI calls: 12 / 300')
    expect(wrapper.find('[data-testid="budget-toggle"]').text()).toBe('Remove AI budget')
  })

  it('shows unlimited and a Restore button when budget is null', () => {
    const wrapper = mountRow({ ai_call_budget: null })
    expect(wrapper.find('[data-testid="ai-calls"]').text()).toBe('AI calls: 12 · unlimited')
    expect(wrapper.find('[data-testid="budget-toggle"]').text()).toBe('Restore AI budget')
  })

  it('emits update with ai_budget_mode=unlimited when removing', async () => {
    const wrapper = mountRow()
    await wrapper.find('[data-testid="budget-toggle"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([['u1', { ai_budget_mode: 'unlimited' }]])
  })

  it('emits update with ai_budget_mode=default when restoring', async () => {
    const wrapper = mountRow({ ai_call_budget: null })
    await wrapper.find('[data-testid="budget-toggle"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([['u1', { ai_budget_mode: 'default' }]])
  })
})
