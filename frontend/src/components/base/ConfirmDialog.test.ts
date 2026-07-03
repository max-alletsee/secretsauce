// frontend/src/components/base/ConfirmDialog.test.ts
import { mount } from '@vue/test-utils'
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
})
