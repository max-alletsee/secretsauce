// frontend/src/components/admin/AdminLayout.test.ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'admin-users' }),
}))

vi.mock('@/api/admin', () => ({
  triggerCleanup: vi.fn(),
}))

import * as adminApi from '@/api/admin'
import AdminLayout from './AdminLayout.vue'

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}
const RouterViewStub = { template: '<div class="router-view-stub" />' }

function mountLayout() {
  return mount(AdminLayout, {
    global: {
      stubs: { RouterLink: RouterLinkStub, RouterView: RouterViewStub },
    },
  })
}

describe('AdminLayout — Run Cleanup confirm gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicking "Run Cleanup" opens the confirm dialog without calling triggerCleanup', async () => {
    const wrapper = mountLayout()

    await wrapper.find('.cleanup-btn').trigger('click')

    expect(adminApi.triggerCleanup).not.toHaveBeenCalled()
    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('title')).toBe('Run cleanup?')
  })

  it('clicking Confirm in the dialog calls triggerCleanup and shows the result', async () => {
    vi.mocked(adminApi.triggerCleanup).mockResolvedValue({
      data: { deleted_count: 3 },
    } as never)

    const wrapper = mountLayout()

    await wrapper.find('.cleanup-btn').trigger('click')
    expect(adminApi.triggerCleanup).not.toHaveBeenCalled()

    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(dialog.props('open')).toBe(true)
    dialog.vm.$emit('confirm')
    await flushPromises()

    expect(adminApi.triggerCleanup).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'ConfirmDialog' }).props('open')).toBe(false)
    expect(wrapper.text()).toContain('Deleted 3 files')
  })

  it('clicking Cancel closes the dialog with zero side effects', async () => {
    const wrapper = mountLayout()

    await wrapper.find('.cleanup-btn').trigger('click')
    let dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(dialog.props('open')).toBe(true)

    dialog.vm.$emit('cancel')
    await wrapper.vm.$nextTick()

    dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(dialog.props('open')).toBe(false)
    expect(adminApi.triggerCleanup).not.toHaveBeenCalled()
  })

  it('passes the dark prop to the ConfirmDialog so it resolves dark tokens', async () => {
    const wrapper = mountLayout()

    await wrapper.find('.cleanup-btn').trigger('click')

    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(dialog.props('dark')).toBe(true)
  })

  it('shows an error message when triggerCleanup fails, after confirming', async () => {
    vi.mocked(adminApi.triggerCleanup).mockRejectedValue(new Error('boom'))

    const wrapper = mountLayout()

    await wrapper.find('.cleanup-btn').trigger('click')
    const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
    dialog.vm.$emit('confirm')
    await flushPromises()

    expect(wrapper.text()).toContain('Cleanup failed')
  })
})
