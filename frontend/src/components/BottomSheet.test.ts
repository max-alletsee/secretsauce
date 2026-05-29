// frontend/src/components/BottomSheet.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BottomSheet from './BottomSheet.vue'

describe('BottomSheet', () => {
  it('renders default slot content', () => {
    const wrapper = mount(BottomSheet, {
      slots: { default: '<p data-testid="body-content">hello</p>' },
      attachTo: document.body,
    })
    expect(document.body.querySelector('[data-testid="body-content"]')?.textContent).toBe('hello')
    wrapper.unmount()
  })

  it('emits close when backdrop clicked', async () => {
    const wrapper = mount(BottomSheet, {
      slots: { default: '<p>body</p>' },
      attachTo: document.body,
    })
    const backdrop = document.body.querySelector('.sheet-backdrop') as HTMLElement
    backdrop.click()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits close on Escape key', async () => {
    const wrapper = mount(BottomSheet, {
      slots: { default: '<p>body</p>' },
      attachTo: document.body,
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits close when close button clicked', async () => {
    const wrapper = mount(BottomSheet, {
      props: { title: 'A title' },
      slots: { default: '<p>body</p>' },
      attachTo: document.body,
    })
    const closeBtn = document.body.querySelector('[data-testid="sheet-close"]') as HTMLElement
    closeBtn.click()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('renders title when provided', () => {
    const wrapper = mount(BottomSheet, {
      props: { title: 'Pick something' },
      slots: { default: '<p>body</p>' },
      attachTo: document.body,
    })
    expect(document.body.querySelector('.sheet-title')?.textContent).toBe('Pick something')
    wrapper.unmount()
  })
})
