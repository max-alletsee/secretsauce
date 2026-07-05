import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import TagFilter from './TagFilter.vue'

describe('TagFilter', () => {
  it('renders tag chips for all groups', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.text()).toContain('vegan')
    expect(wrapper.text()).toContain('italian')
    expect(wrapper.text()).toContain('breakfast')
  })

  it('clicking a chip adds it to model value', async () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
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

  it('does not render an expand/collapse toggle button', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.find('[data-testid="tag-filter-toggle"]').exists()).toBe(false)
  })

  it('renders group labels', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.text()).toContain('Protein')
    expect(wrapper.text()).toContain('Diet')
    expect(wrapper.text()).toContain('Season')
    expect(wrapper.text()).toContain('Meal type')
    expect(wrapper.text()).toContain('Cuisine')
  })
})
