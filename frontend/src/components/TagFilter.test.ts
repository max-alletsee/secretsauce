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

  it('toggle button is present in DOM', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: [] },
    })
    expect(wrapper.find('[data-testid="tag-filter-toggle"]').exists()).toBe(true)
  })

  it('toggle button shows active count when tags selected', () => {
    const wrapper = mount(TagFilter, {
      props: { modelValue: ['vegan', 'italian'] },
    })
    const toggleBtn = wrapper.find('[data-testid="tag-filter-toggle"]')
    expect(toggleBtn.text()).toContain('2')
  })
})
