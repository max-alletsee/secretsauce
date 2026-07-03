// frontend/src/components/base/ProgressBar.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProgressBar from './ProgressBar.vue'

describe('ProgressBar', () => {
  it('renders an element with role="progressbar"', () => {
    const wrapper = mount(ProgressBar, { props: { value: 50, max: 100 } })
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)
  })

  it('sets aria-valuenow to the value prop', () => {
    const wrapper = mount(ProgressBar, { props: { value: 30, max: 100 } })
    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('30')
  })

  it('sets aria-valuemin to 0', () => {
    const wrapper = mount(ProgressBar, { props: { value: 30, max: 100 } })
    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuemin')).toBe('0')
  })

  it('sets aria-valuemax to the max prop', () => {
    const wrapper = mount(ProgressBar, { props: { value: 30, max: 200 } })
    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuemax')).toBe('200')
  })

  it('fill width is value/max * 100 percent', () => {
    const wrapper = mount(ProgressBar, { props: { value: 25, max: 100 } })
    const fill = wrapper.find('.progress-bar__fill')
    expect(fill.exists()).toBe(true)
    expect(fill.attributes('style')).toContain('width: 25%')
  })

  it('fill width is 75% for value=3, max=4', () => {
    const wrapper = mount(ProgressBar, { props: { value: 3, max: 4 } })
    const fill = wrapper.find('.progress-bar__fill')
    expect(fill.attributes('style')).toContain('width: 75%')
  })

  it('fill width clamps to 100% when value > max', () => {
    const wrapper = mount(ProgressBar, { props: { value: 150, max: 100 } })
    const fill = wrapper.find('.progress-bar__fill')
    expect(fill.attributes('style')).toContain('width: 100%')
  })

  it('fill width clamps to 0% when value < 0', () => {
    const wrapper = mount(ProgressBar, { props: { value: -10, max: 100 } })
    const fill = wrapper.find('.progress-bar__fill')
    expect(fill.attributes('style')).toContain('width: 0%')
  })

  it('fill width is 0% when max <= 0', () => {
    const wrapper = mount(ProgressBar, { props: { value: 50, max: 0 } })
    const fill = wrapper.find('.progress-bar__fill')
    expect(fill.attributes('style')).toContain('width: 0%')
  })

  it('fill width is 0% when max is negative', () => {
    const wrapper = mount(ProgressBar, { props: { value: 50, max: -1 } })
    const fill = wrapper.find('.progress-bar__fill')
    expect(fill.attributes('style')).toContain('width: 0%')
  })

  it('renders the label when label prop is provided', () => {
    const wrapper = mount(ProgressBar, { props: { value: 5, max: 10, label: 'Progress' } })
    expect(wrapper.text()).toContain('Progress')
  })

  it('does not render a label element when label prop is omitted', () => {
    const wrapper = mount(ProgressBar, { props: { value: 5, max: 10 } })
    expect(wrapper.find('.progress-bar__label').exists()).toBe(false)
  })
})
