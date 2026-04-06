// frontend/src/components/SortControl.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SortControl from './SortControl.vue'

describe('SortControl', () => {
  it('renders a select with sort options', () => {
    const wrapper = mount(SortControl, {
      props: { modelValue: 'created_at_desc', popularityAvailable: false },
    })
    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    expect(select.find('option[value="created_at_desc"]').exists()).toBe(true)
    expect(select.find('option[value="title_asc"]').exists()).toBe(true)
    expect(select.find('option[value="total_time_asc"]').exists()).toBe(true)
    expect(select.find('option[value="popularity"]').exists()).toBe(true)
  })

  it('popularity option is disabled when popularityAvailable is false', () => {
    const wrapper = mount(SortControl, {
      props: { modelValue: 'created_at_desc', popularityAvailable: false },
    })
    const option = wrapper.find('option[value="popularity"]')
    expect((option.element as HTMLOptionElement).disabled).toBe(true)
  })

  it('popularity option is enabled when popularityAvailable is true', () => {
    const wrapper = mount(SortControl, {
      props: { modelValue: 'created_at_desc', popularityAvailable: true },
    })
    const option = wrapper.find('option[value="popularity"]')
    expect((option.element as HTMLOptionElement).disabled).toBe(false)
  })

  it('emits update:modelValue when selection changes', async () => {
    const wrapper = mount(SortControl, {
      props: { modelValue: 'created_at_desc', popularityAvailable: false },
    })
    await wrapper.find('select').setValue('title_asc')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['title_asc'])
  })

  it('reflects the current modelValue as selected', () => {
    const wrapper = mount(SortControl, {
      props: { modelValue: 'title_asc', popularityAvailable: false },
    })
    const select = wrapper.find('select').element as HTMLSelectElement
    expect(select.value).toBe('title_asc')
  })
})
