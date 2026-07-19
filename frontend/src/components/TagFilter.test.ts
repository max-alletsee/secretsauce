import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import TagFilter from './TagFilter.vue'

describe('TagFilter', () => {
  it('renders tag chips for all groups once expanded', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    await wrapper.find('[data-testid="tag-filter-toggle"]').trigger('click')
    expect(wrapper.text()).toContain('vegan')
    expect(wrapper.text()).toContain('italian')
    expect(wrapper.text()).toContain('breakfast')
  })

  it('clicking a chip adds it to model value', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    await wrapper.find('[data-testid="tag-filter-toggle"]').trigger('click')
    const veganChip = wrapper.findAll('button').find((b) => b.text() === 'vegan')
    expect(veganChip).toBeDefined()
    await veganChip!.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toEqual(['vegan'])
  })

  it('clicking an active chip removes it from model value', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: ['vegan'] },
    })
    await wrapper.find('[data-testid="tag-filter-toggle"]').trigger('click')
    const veganChip = wrapper.findAll('button').find((b) => b.text() === 'vegan')
    expect(veganChip).toBeDefined()
    await veganChip!.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toEqual([])
  })

  it('clear all button is hidden when no tags selected', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.find('[data-testid="tag-filter-clear"]').exists()).toBe(false)
  })

  it('clear all button is visible when tags selected', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: ['vegan'] },
    })
    expect(wrapper.find('[data-testid="tag-filter-clear"]').exists()).toBe(true)
  })

  it('clicking clear all emits empty array', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: ['vegan', 'italian'] },
    })
    await wrapper.find('[data-testid="tag-filter-clear"]').trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toEqual([])
  })

  it('shows active filter count when tags are selected', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: ['vegan', 'italian'] },
    })
    expect(wrapper.text()).toContain('2')
  })

  it('renders an expand/collapse toggle button', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.find('[data-testid="tag-filter-toggle"]').exists()).toBe(true)
  })

  it('hides tag groups by default', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.find('.tag-filter__groups').exists()).toBe(false)
  })

  it('toggle button has aria-expanded false by default', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.find('[data-testid="tag-filter-toggle"]').attributes('aria-expanded')).toBe('false')
  })

  it('clicking the toggle button reveals tag groups', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    await wrapper.find('[data-testid="tag-filter-toggle"]').trigger('click')
    expect(wrapper.find('.tag-filter__groups').exists()).toBe(true)
    expect(wrapper.text()).toContain('vegan')
  })

  it('clicking the toggle button twice hides tag groups again', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    const toggle = wrapper.find('[data-testid="tag-filter-toggle"]')
    await toggle.trigger('click')
    await toggle.trigger('click')
    expect(wrapper.find('.tag-filter__groups').exists()).toBe(false)
  })

  it('sets aria-expanded true when expanded', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    await wrapper.find('[data-testid="tag-filter-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="tag-filter-toggle"]').attributes('aria-expanded')).toBe('true')
  })

  it('renders group labels once expanded', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    await wrapper.find('[data-testid="tag-filter-toggle"]').trigger('click')
    expect(wrapper.text()).toContain('Protein')
    expect(wrapper.text()).toContain('Diet')
    expect(wrapper.text()).toContain('Season')
    expect(wrapper.text()).toContain('Meal type')
    expect(wrapper.text()).toContain('Cuisine')
  })

  it('clear all button works without expanding the panel', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: ['vegan', 'italian'] },
    })
    expect(wrapper.find('.tag-filter__groups').exists()).toBe(false)
    await wrapper.find('[data-testid="tag-filter-clear"]').trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toEqual([])
  })
})
