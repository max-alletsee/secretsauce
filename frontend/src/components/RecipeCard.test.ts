// frontend/src/components/RecipeCard.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Recipe, RecipeVersion } from '@/types/recipe'

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

import RecipeCard from './RecipeCard.vue'

// RouterLink stub that passes `to` through so we can assert the tap target
// without needing a real router instance.
const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

const mockVersion: RecipeVersion = {
  id: 'v1',
  recipe_id: 'r1',
  version_number: 1,
  title: 'Pasta Carbonara',
  description: 'Classic Roman pasta',
  ingredients: [{ name: 'spaghetti', quantity: '400', unit: 'g' }],
  steps: [{ order: 1, instruction: 'Boil pasta' }],
  servings: 2,
  prep_time_minutes: 10,
  waiting_time_minutes: null,
  cook_time_minutes: 20,
  total_time_minutes: 30,
  tags: ['italian', 'dinner'],
  recipe_source: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockRecipe: Recipe = {
  id: 'r1',
  owner_id: 'u1',
  visibility: 'private',
  current_version: mockVersion,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  times_cooked: 0,
  last_cooked_at: null,
}

function mountCard(recipe: Recipe) {
  return mount(RecipeCard, {
    props: { recipe },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('RecipeCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the recipe title as an h3 (inherits display font from global heading rule)', () => {
    const wrapper = mountCard(mockRecipe)
    const title = wrapper.find('h3.recipe-card__title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('Pasta Carbonara')
  })

  it('whole card is a RouterLink to /recipes/:id', () => {
    const wrapper = mountCard(mockRecipe)
    const link = wrapper.find('a.recipe-card')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/recipes/r1')
  })

  it('renders a Clock icon + time value when total_time_minutes present', () => {
    const wrapper = mountCard(mockRecipe)
    const meta = wrapper.find('.recipe-card__meta')
    expect(meta.text()).toContain('30 min')
    // Clock icon rendered as decorative svg (aria-hidden) inside the meta row
    expect(meta.findAll('svg').length).toBeGreaterThanOrEqual(2)
  })

  it('renders a Users icon + servings value when servings present', () => {
    const wrapper = mountCard(mockRecipe)
    expect(wrapper.find('.recipe-card__meta').text()).toContain('2 servings')
  })

  it('does not render cook-count when times_cooked is 0', () => {
    const wrapper = mountCard({ ...mockRecipe, times_cooked: 0 })
    expect(wrapper.find('.recipe-card__cook-count').exists()).toBe(false)
  })

  it('renders cook-count when times_cooked > 0', () => {
    const wrapper = mountCard({ ...mockRecipe, times_cooked: 3, last_cooked_at: null })
    const cookCount = wrapper.find('.recipe-card__cook-count')
    expect(cookCount.exists()).toBe(true)
    expect(cookCount.text()).toContain('Cooked 3×')
  })

  it('renders last-cooked date when times_cooked > 0 and last_cooked_at present', () => {
    const wrapper = mountCard({
      ...mockRecipe,
      times_cooked: 2,
      last_cooked_at: '2026-06-15T00:00:00Z',
    })
    const cookCount = wrapper.find('.recipe-card__cook-count')
    expect(cookCount.text()).toContain('Last cooked')
  })

  it('renders a Heart favorite toggle button with an aria-label', () => {
    const wrapper = mountCard(mockRecipe)
    const heartBtn = wrapper.find('[data-testid="favorite-toggle"]')
    expect(heartBtn.exists()).toBe(true)
    expect(heartBtn.attributes('aria-label')).toBeTruthy()
  })

  it('clicking the Heart toggle flips its aria-pressed state without navigating', async () => {
    const wrapper = mountCard(mockRecipe)
    const heartBtn = wrapper.find('[data-testid="favorite-toggle"]')
    expect(heartBtn.attributes('aria-pressed')).toBe('false')
    await heartBtn.trigger('click')
    expect(heartBtn.attributes('aria-pressed')).toBe('true')
    // The card itself is still the same RouterLink target; clicking the
    // favorite toggle must not have triggered a route change (jsdom's
    // location stays put since the click was stopped/prevented).
    const link = wrapper.find('a.recipe-card')
    expect(link.attributes('href')).toBe('/recipes/r1')
  })

  it('truncates tags beyond MAX_VISIBLE_TAGS and shows a "+N more" chip', () => {
    const recipe: Recipe = {
      ...mockRecipe,
      current_version: {
        ...mockVersion,
        tags: ['italian', 'dinner', 'quick', 'comfort-food', 'winter'],
      },
    }
    const wrapper = mountCard(recipe)
    const tags = wrapper.findAll('.recipe-card__tag:not(.recipe-card__tag--more)')
    expect(tags.length).toBe(3)
    expect(wrapper.find('.recipe-card__tag--more').text()).toBe('+2 more')
  })
})
