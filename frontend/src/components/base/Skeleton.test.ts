// frontend/src/components/base/Skeleton.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Skeleton from './Skeleton.vue'

describe('Skeleton', () => {
  it('renders a div root element', () => {
    const wrapper = mount(Skeleton)
    expect(wrapper.element.tagName).toBe('DIV')
  })

  it('applies default width of 100% when no width prop is given', () => {
    const wrapper = mount(Skeleton)
    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('width: 100%')
    expect(style).toContain('height: 1rem')
    expect(style).toContain('border-radius: var(--radius-sm)')
  })

  it('applies custom width from prop', () => {
    const wrapper = mount(Skeleton, { props: { width: '200px' } })
    expect(wrapper.attributes('style')).toContain('width: 200px')
  })

  it('applies custom height from prop', () => {
    const wrapper = mount(Skeleton, { props: { height: '48px' } })
    expect(wrapper.attributes('style')).toContain('height: 48px')
  })

  it('applies custom radius from prop', () => {
    const wrapper = mount(Skeleton, { props: { radius: '8px' } })
    expect(wrapper.attributes('style')).toContain('border-radius: 8px')
  })

  it('reflects all three props in style simultaneously', () => {
    const wrapper = mount(Skeleton, {
      props: { width: '120px', height: '20px', radius: '4px' },
    })
    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('width: 120px')
    expect(style).toContain('height: 20px')
    expect(style).toContain('border-radius: 4px')
  })

  it('has the skeleton CSS class', () => {
    const wrapper = mount(Skeleton)
    expect(wrapper.classes()).toContain('skeleton')
  })
})
