// frontend/src/components/base/BaseIcon.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Camera } from 'lucide-vue-next'
import BaseIcon from './BaseIcon.vue'

describe('BaseIcon', () => {
  it('renders the given icon as an svg', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('applies size prop: size=24 sets width and height to 24 on the svg', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera, size: 24 } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('24')
    expect(svg.attributes('height')).toBe('24')
  })

  it('applies default size 20 when size prop is omitted', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('height')).toBe('20')
  })

  it('applies size prop: size=16 sets width and height to 16 on the svg', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera, size: 16 } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('height')).toBe('16')
  })

  it('when label given: sets aria-label and role="img" on the rendered element', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera, label: 'Take a photo' } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-label')).toBe('Take a photo')
    expect(svg.attributes('role')).toBe('img')
  })

  it('when label given: does NOT set aria-hidden', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera, label: 'Take a photo' } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBeUndefined()
  })

  it('when no label: sets aria-hidden="true" on the rendered element', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
  })

  it('when no label: does NOT set aria-label', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-label')).toBeUndefined()
  })

  it('when empty string label: treats as no label and sets aria-hidden="true"', () => {
    const wrapper = mount(BaseIcon, { props: { icon: Camera, label: '' } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('aria-label')).toBeUndefined()
  })
})
