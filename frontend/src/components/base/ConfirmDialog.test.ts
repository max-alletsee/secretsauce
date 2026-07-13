// frontend/src/components/base/ConfirmDialog.test.ts
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import ConfirmDialog from './ConfirmDialog.vue'

// Teleport renders to document.body in tests when we use attachTo: document.body
// We use global: { stubs: { teleport: true } } to inline the teleport output
// so queries work without needing a real DOM body.

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'Delete recipe',
    message: 'Are you sure you want to delete this recipe?',
  }

  it('renders nothing when open is false', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: false, title: 'Test' },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('renders the dialog when open is true', () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('displays the title', () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.text()).toContain('Delete recipe')
  })

  it('displays the message when provided', () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.text()).toContain('Are you sure you want to delete this recipe?')
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    await wrapper.find('[data-testid="confirm-btn"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('emits cancel when the backdrop is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    await wrapper.find('[data-testid="dialog-backdrop"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('emits cancel when Escape is pressed', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await wrapper.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('Tab on last focusable wraps focus to first focusable', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()

    // Locate focusable elements using the same selector as the component
    const FOCUSABLES =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const dialogEl = wrapper.find('[role="dialog"]').element
    const focusables = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLES))
    expect(focusables.length).toBeGreaterThanOrEqual(2)

    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    // Put focus on the last button
    last.focus()
    expect(document.activeElement).toBe(last)

    // Dispatch Tab on document (where the trap listener lives)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    await nextTick()

    expect(document.activeElement).toBe(first)

    wrapper.unmount()
  })

  it('Shift+Tab on first focusable wraps focus to last focusable', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()

    const FOCUSABLES =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const dialogEl = wrapper.find('[role="dialog"]').element
    const focusables = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLES))
    expect(focusables.length).toBeGreaterThanOrEqual(2)

    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    // Put focus on the first button
    first.focus()
    expect(document.activeElement).toBe(first)

    // Dispatch Shift+Tab on document (where the trap listener lives)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    await nextTick()

    expect(document.activeElement).toBe(last)

    wrapper.unmount()
  })

  it('uses default confirmLabel "Confirm" and cancelLabel "Cancel"', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Test' },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('[data-testid="confirm-btn"]').text()).toBe('Confirm')
    expect(wrapper.find('[data-testid="cancel-btn"]').text()).toBe('Cancel')
  })

  it('uses custom confirmLabel and cancelLabel when provided', () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        title: 'Test',
        confirmLabel: 'Yes, delete',
        cancelLabel: 'No, keep it',
      },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('[data-testid="confirm-btn"]').text()).toBe('Yes, delete')
    expect(wrapper.find('[data-testid="cancel-btn"]').text()).toBe('No, keep it')
  })

  it('applies danger variant on confirm button when danger prop is true', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Test', danger: true },
      global: { stubs: { teleport: true } },
    })
    const confirmBtn = wrapper.find('[data-testid="confirm-btn"]')
    expect(confirmBtn.classes()).toContain('btn--danger')
  })

  it('applies primary variant on confirm button when danger prop is false (default)', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Test' },
      global: { stubs: { teleport: true } },
    })
    const confirmBtn = wrapper.find('[data-testid="confirm-btn"]')
    expect(confirmBtn.classes()).toContain('btn--primary')
  })

  it('has role="dialog" and aria-modal="true"', () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
  })

  it('has aria-label or aria-labelledby pointing to the title', () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    const dialog = wrapper.find('[role="dialog"]')
    const hasLabel =
      dialog.attributes('aria-label') !== undefined ||
      dialog.attributes('aria-labelledby') !== undefined
    expect(hasLabel).toBe(true)
  })

  it('does not set data-theme on the dialog or backdrop when dark prop is false (default)', () => {
    const wrapper = mount(ConfirmDialog, {
      props: defaultProps,
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('[role="dialog"]').attributes('data-theme')).toBeUndefined()
    expect(wrapper.find('[data-testid="dialog-backdrop"]').attributes('data-theme')).toBeUndefined()
  })

  it('sets data-theme="dark" on the teleported dialog and backdrop when dark prop is true', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { ...defaultProps, dark: true },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('[role="dialog"]').attributes('data-theme')).toBe('dark')
    expect(wrapper.find('[data-testid="dialog-backdrop"]').attributes('data-theme')).toBe('dark')
  })
})
