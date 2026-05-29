// frontend/src/components/AddToPlanButton.test.ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/timeline', () => ({
  listEntries: vi.fn().mockResolvedValue({ data: { entries: [] } }),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn().mockResolvedValue({ data: null }),
}))

vi.mock('@/api/mealPlans', () => ({
  getShortlist: vi.fn().mockResolvedValue({ data: [] }),
  addToShortlist: vi.fn(),
  removeFromShortlist: vi.fn().mockResolvedValue({ data: null }),
  reorderShortlist: vi.fn(),
}))

import AddToPlanButton from './AddToPlanButton.vue'
import * as timelineApi from '@/api/timeline'
import * as mealPlansApi from '@/api/mealPlans'
import { useUserStore } from '@/stores/useUserStore'
import type { ShortlistEntry } from '@/types/mealPlan'

function fakeCreatedEntry(payload: Record<string, unknown>) {
  return {
    data: {
      id: 'new-1',
      user_id: 'u1',
      meal_plan_id: null,
      date: payload.date,
      meal_type: payload.meal_type,
      recipe_id: payload.recipe_id ?? null,
      note: payload.note ?? null,
      entry_type: payload.entry_type ?? 'recipe',
      servings: 1,
      source: payload.source ?? 'manual',
      position: payload.position ?? 0,
      created_at: '2026-05-29T00:00:00Z',
    },
  }
}

function setUserToToday(today: string) {
  const u = useUserStore()
  u.user = {
    id: 'u1',
    email: 'a@b.com',
    is_active: true,
    is_superuser: false,
    meal_plan_days_ahead: 5,
    meal_plan_meal_types: ['breakfast', 'lunch', 'dinner'],
    // remaining required-ish fields filled with safe defaults to satisfy any usage
  } as never
  // Freeze today
  vi.setSystemTime(new Date(`${today}T12:00:00Z`))
}

describe('AddToPlanButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    setUserToToday('2026-05-29')
    vi.mocked(timelineApi.createEntry).mockClear()
    vi.mocked(mealPlansApi.addToShortlist).mockClear()
    vi.mocked(timelineApi.createEntry).mockImplementation((p) =>
      Promise.resolve(fakeCreatedEntry(p as unknown as Record<string, unknown>)) as never,
    )
    vi.mocked(mealPlansApi.addToShortlist).mockImplementation((p) =>
      Promise.resolve({
        data: {
          id: 's-new',
          user_id: 'u1',
          recipe_id: (p as { recipe_id?: string }).recipe_id ?? null,
          note: (p as { note?: string }).note ?? null,
          entry_type: (p as { entry_type: 'recipe' | 'suggestion' }).entry_type,
          position: 0,
          created_at: '2026-05-29T00:00:00Z',
        } satisfies ShortlistEntry,
      }) as never,
    )
  })

  it('opens sheet on click', async () => {
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'recipe', recipeId: 'r1', title: 'Pasta' } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-testid="day-meal-picker"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('recipe source → calls addEntry with recipe payload', async () => {
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'recipe', recipeId: 'r1', title: 'Pasta' } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    // smart default = first non-past empty slot → 2026-05-29 breakfast
    const confirm = document.body.querySelector('[data-testid="picker-confirm"]') as HTMLElement
    confirm.click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith({
      date: '2026-05-29',
      meal_type: 'breakfast',
      recipe_id: 'r1',
      entry_type: 'recipe',
      source: 'manual',
      position: 0,
    })
    wrapper.unmount()
  })

  it('suggestion source with matched recipe → recipe entry, ai_suggested', async () => {
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'suggestion', title: 'Pad Thai', matchedRecipeId: 'rx' } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('[data-testid="picker-confirm"]') as HTMLElement).click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe_id: 'rx',
        entry_type: 'recipe',
        source: 'ai_suggested',
      }),
    )
    wrapper.unmount()
  })

  it('suggestion source without matched recipe → suggestion entry with note', async () => {
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'suggestion', title: 'Thai curry', matchedRecipeId: null } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('[data-testid="picker-confirm"]') as HTMLElement).click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Thai curry',
        entry_type: 'suggestion',
        source: 'ai_suggested',
      }),
    )
    expect(vi.mocked(timelineApi.createEntry).mock.calls[0]?.[0]).not.toHaveProperty('recipe_id')
    wrapper.unmount()
  })

  it('shortlist source with recipe_id → recipe entry, manual', async () => {
    const entry: ShortlistEntry = {
      id: 's1',
      user_id: 'u1',
      recipe_id: 'rs',
      note: 'Saved one',
      entry_type: 'recipe',
      position: 0,
      created_at: '2026-04-07T00:00:00Z',
    }
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'shortlist', entry } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('[data-testid="picker-confirm"]') as HTMLElement).click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ recipe_id: 'rs', entry_type: 'recipe', source: 'manual' }),
    )
    wrapper.unmount()
  })

  it('shortlist source without recipe_id → suggestion entry, manual', async () => {
    const entry: ShortlistEntry = {
      id: 's2',
      user_id: 'u1',
      recipe_id: null,
      note: 'Shakshuka',
      entry_type: 'suggestion',
      position: 0,
      created_at: '2026-04-07T00:00:00Z',
    }
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'shortlist', entry } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('[data-testid="picker-confirm"]') as HTMLElement).click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Shakshuka', entry_type: 'suggestion', source: 'manual' }),
    )
    wrapper.unmount()
  })

  it('Add to shortlist option calls shortlist API with correct payload (recipe)', async () => {
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'recipe', recipeId: 'r1', title: 'Pasta' } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('[data-testid="add-to-shortlist-option"]') as HTMLElement).click()
    await flushPromises()
    expect(mealPlansApi.addToShortlist).toHaveBeenCalledWith({
      recipe_id: 'r1',
      entry_type: 'recipe',
      note: 'Pasta',
    })
    wrapper.unmount()
  })

  it('shortlist source does not render the "Add to shortlist" option', async () => {
    const entry: ShortlistEntry = {
      id: 's3',
      user_id: 'u1',
      recipe_id: 'rs',
      note: null,
      entry_type: 'recipe',
      position: 0,
      created_at: '2026-04-07T00:00:00Z',
    }
    const wrapper = mount(AddToPlanButton, {
      props: { source: { kind: 'shortlist', entry } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="add-to-plan-btn"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-testid="add-to-shortlist-option"]')).toBeNull()
    wrapper.unmount()
  })
})
