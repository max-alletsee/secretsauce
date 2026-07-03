// frontend/src/components/base/SegmentedTabs.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SegmentedTabs from './SegmentedTabs.vue'

const tabs = [
  { value: 'url', label: 'URL' },
  { value: 'image', label: 'Image' },
  { value: 'manual', label: 'Manual' },
]

describe('SegmentedTabs', () => {
  it('renders a container with role="tablist"', () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
  })

  it('renders one button with role="tab" per tab entry', () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    const tabEls = wrapper.findAll('[role="tab"]')
    expect(tabEls).toHaveLength(3)
  })

  it('renders each tab label as text', () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    expect(wrapper.text()).toContain('URL')
    expect(wrapper.text()).toContain('Image')
    expect(wrapper.text()).toContain('Manual')
  })

  it('sets aria-selected="true" on the active tab only', () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'image', tabs } })
    const [tab0, tab1, tab2] = wrapper.findAll('[role="tab"]')
    expect(tab0!.attributes('aria-selected')).toBe('false')
    expect(tab1!.attributes('aria-selected')).toBe('true')
    expect(tab2!.attributes('aria-selected')).toBe('false')
  })

  it('gives active tab tabindex=0 and others tabindex=-1 (roving tabindex)', () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'image', tabs } })
    const [tab0, tab1, tab2] = wrapper.findAll('[role="tab"]')
    expect(tab0!.attributes('tabindex')).toBe('-1')
    expect(tab1!.attributes('tabindex')).toBe('0')
    expect(tab2!.attributes('tabindex')).toBe('-1')
  })

  it('emits update:modelValue with the clicked tab value', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    const [, tab1] = wrapper.findAll('[role="tab"]')
    await tab1!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['image'])
  })

  it('does not emit update:modelValue when already-active tab is clicked', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    const [tab0] = wrapper.findAll('[role="tab"]')
    await tab0!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('ArrowRight moves selection to the next tab', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    const [tab0] = wrapper.findAll('[role="tab"]')
    await tab0!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['image'])
  })

  it('ArrowLeft moves selection to the previous tab', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'image', tabs } })
    const [, tab1] = wrapper.findAll('[role="tab"]')
    await tab1!.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['url'])
  })

  it('ArrowRight wraps from last tab to first', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'manual', tabs } })
    const [, , tab2] = wrapper.findAll('[role="tab"]')
    await tab2!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['url'])
  })

  it('ArrowLeft wraps from first tab to last', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    const [tab0] = wrapper.findAll('[role="tab"]')
    await tab0!.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['manual'])
  })

  it('ArrowDown moves selection to the next tab', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'url', tabs } })
    const [tab0] = wrapper.findAll('[role="tab"]')
    await tab0!.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['image'])
  })

  it('ArrowUp moves selection to the previous tab', async () => {
    const wrapper = mount(SegmentedTabs, { props: { modelValue: 'image', tabs } })
    const [, tab1] = wrapper.findAll('[role="tab"]')
    await tab1!.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['url'])
  })
})
