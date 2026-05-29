// frontend/src/components/RecipePicker.test.ts
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
  generateSuggestions: vi.fn(),
  pollSuggestionStatus: vi.fn(),
}))
vi.mock('@/api/recipes', () => ({
  getRecipes: vi.fn().mockResolvedValue({ data: { items: [], next_cursor: null, has_more: false } }),
}))

import RecipePicker from './RecipePicker.vue'
import * as timelineApi from '@/api/timeline'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useMealPlanStore } from '@/stores/useMealPlanStore'

function fakeCreated(payload: { date: string; meal_type: string }) {
  return {
    data: {
      id: 'new',
      user_id: 'u1',
      meal_plan_id: null,
      date: payload.date,
      meal_type: payload.meal_type,
      recipe_id: null,
      note: null,
      entry_type: 'suggestion',
      servings: 1,
      source: 'manual',
      position: 0,
      created_at: '2026-05-29T00:00:00Z',
    },
  }
}

function qs<E extends Element = HTMLElement>(sel: string): E {
  const el = document.body.querySelector<E>(sel)
  if (!el) throw new Error(`Selector not found: ${sel}`)
  return el
}

describe('RecipePicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    vi.mocked(timelineApi.createEntry).mockReset()
    vi.mocked(timelineApi.createEntry).mockImplementation((p) =>
      Promise.resolve(fakeCreated(p as { date: string; meal_type: string })) as never,
    )
  })

  it('picking a recipe calls timeline addEntry with recipe payload', async () => {
    const recipes = useRecipeStore()
    recipes.recipes = [
      {
        id: 'r1',
        owner_id: 'u1',
        visibility: 'private',
        created_at: '',
        updated_at: '',
        current_version: {
          id: 'v1',
          recipe_id: 'r1',
          version_number: 1,
          title: 'Pasta',
          description: null,
          ingredients: [],
          steps: [],
          servings: 2,
          prep_time_minutes: null,
          waiting_time_minutes: null,
          cook_time_minutes: null,
          total_time_minutes: null,
          tags: [],
          recipe_source: null,
          created_at: '',
          created_by: 'u1',
        },
      } as never,
    ]
    const wrapper = mount(RecipePicker, {
      props: { date: '2026-05-29', mealType: 'dinner' },
      attachTo: document.body,
    })
    await flushPromises()
    qs('[data-testid="recipe-picker-recipe-r1"]').click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-05-29',
        meal_type: 'dinner',
        recipe_id: 'r1',
        entry_type: 'recipe',
        source: 'manual',
      }),
    )
    expect(wrapper.emitted('picked')).toBeTruthy()
    wrapper.unmount()
  })

  it('picking a shortlist entry with recipe_id → recipe payload', async () => {
    const sl = useShortlistStore()
    sl.entries = [
      {
        id: 's1',
        user_id: 'u1',
        recipe_id: 'rs',
        note: 'Saved',
        entry_type: 'recipe',
        position: 0,
        created_at: '',
      },
    ]
    const wrapper = mount(RecipePicker, {
      props: { date: '2026-05-29', mealType: 'dinner' },
      attachTo: document.body,
    })
    await flushPromises()
    qs('[data-testid="picker-tab-shortlist"]').click()
    await flushPromises()
    qs('[data-testid="recipe-picker-shortlist-s1"]').click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ recipe_id: 'rs', entry_type: 'recipe', source: 'manual' }),
    )
    wrapper.unmount()
  })

  it('picking a suggestion without matched recipe → suggestion payload', async () => {
    const plan = useMealPlanStore()
    plan.suggestions = [
      { title: 'Pad Thai', matched_recipe_id: null, entry_type: 'suggestion' },
    ]
    const wrapper = mount(RecipePicker, {
      props: { date: '2026-05-29', mealType: 'dinner' },
      attachTo: document.body,
    })
    await flushPromises()
    qs('[data-testid="picker-tab-suggestions"]').click()
    await flushPromises()
    qs('[data-testid="recipe-picker-suggestion-0"]').click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Pad Thai',
        entry_type: 'suggestion',
        source: 'ai_suggested',
      }),
    )
    wrapper.unmount()
  })

  it('submitting a note → freetext payload', async () => {
    const wrapper = mount(RecipePicker, {
      props: { date: '2026-05-29', mealType: 'dinner' },
      attachTo: document.body,
    })
    await flushPromises()
    qs('[data-testid="picker-tab-note"]').click()
    await flushPromises()
    const input = qs<HTMLInputElement>('[data-testid="recipe-picker-note-input"]')
    input.value = 'Eating out'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    qs('[data-testid="recipe-picker-note-submit"]').click()
    await flushPromises()
    expect(timelineApi.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Eating out', entry_type: 'freetext', source: 'manual' }),
    )
    wrapper.unmount()
  })

  it('cancel emits cancel', async () => {
    const wrapper = mount(RecipePicker, {
      props: { date: '2026-05-29', mealType: 'dinner' },
      attachTo: document.body,
    })
    await flushPromises()
    qs('[data-testid="recipe-picker-cancel"]').click()
    expect(wrapper.emitted('cancel')).toBeTruthy()
    wrapper.unmount()
  })
})
