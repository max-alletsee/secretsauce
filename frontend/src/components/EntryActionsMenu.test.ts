// frontend/src/components/EntryActionsMenu.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EntryActionsMenu from './EntryActionsMenu.vue'
import type { TimelineEntry } from '@/types/timeline'

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'e1',
    user_id: 'u1',
    meal_plan_id: null,
    date: '2026-05-29',
    meal_type: 'dinner',
    recipe_id: 'r1',
    note: null,
    entry_type: 'recipe',
    servings: 2,
    source: 'manual',
    position: 0,
    created_at: '2026-05-29T00:00:00Z',
    ...overrides,
  }
}

describe('EntryActionsMenu', () => {
  it('renders Open recipe only for recipe entries', () => {
    const recipe = mount(EntryActionsMenu, { props: { entry: makeEntry() } })
    expect(recipe.find('[data-testid="entry-action-open"]').exists()).toBe(true)
    const suggestion = mount(EntryActionsMenu, {
      props: { entry: makeEntry({ entry_type: 'suggestion', recipe_id: null, note: 'X' }) },
    })
    expect(suggestion.find('[data-testid="entry-action-open"]').exists()).toBe(false)
  })

  it('emits open-recipe with recipe_id and close', async () => {
    const w = mount(EntryActionsMenu, { props: { entry: makeEntry() } })
    await w.find('[data-testid="entry-action-open"]').trigger('click')
    expect(w.emitted('open-recipe')?.[0]).toEqual(['r1'])
    expect(w.emitted('close')).toBeTruthy()
  })

  it('emits move-to-slot and close', async () => {
    const w = mount(EntryActionsMenu, { props: { entry: makeEntry() } })
    await w.find('[data-testid="entry-action-move-slot"]').trigger('click')
    expect(w.emitted('move-to-slot')).toBeTruthy()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('emits move-to-shortlist and close', async () => {
    const w = mount(EntryActionsMenu, { props: { entry: makeEntry() } })
    await w.find('[data-testid="entry-action-move-shortlist"]').trigger('click')
    expect(w.emitted('move-to-shortlist')).toBeTruthy()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('emits save-to-shortlist and close', async () => {
    const w = mount(EntryActionsMenu, { props: { entry: makeEntry() } })
    await w.find('[data-testid="entry-action-save-shortlist"]').trigger('click')
    expect(w.emitted('save-to-shortlist')).toBeTruthy()
  })

  it('emits remove and close', async () => {
    const w = mount(EntryActionsMenu, { props: { entry: makeEntry() } })
    await w.find('[data-testid="entry-action-remove"]').trigger('click')
    expect(w.emitted('remove')).toBeTruthy()
  })

  it('Escape key emits close', async () => {
    const w = mount(EntryActionsMenu, { props: { entry: makeEntry() }, attachTo: document.body })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })
})
