// frontend/src/components/SearchBar.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SearchBar from './SearchBar.vue'

describe('SearchBar', () => {
  it('renders a search input', () => {
    const wrapper = mount(SearchBar, { props: { modelValue: '' } })
    expect(wrapper.find('input[type="search"]').exists()).toBe(true)
  })

  it('emits update:modelValue when input changes', async () => {
    const wrapper = mount(SearchBar, { props: { modelValue: '' } })
    await wrapper.find('input').setValue('pasta')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['pasta'])
  })

  it('shows clear button when value is non-empty', () => {
    const wrapper = mount(SearchBar, { props: { modelValue: 'pasta' } })
    expect(wrapper.find('[data-testid="search-clear"]').exists()).toBe(true)
  })

  it('hides clear button when value is empty', () => {
    const wrapper = mount(SearchBar, { props: { modelValue: '' } })
    expect(wrapper.find('[data-testid="search-clear"]').exists()).toBe(false)
  })

  it('emits empty string when clear button clicked', async () => {
    const wrapper = mount(SearchBar, { props: { modelValue: 'pasta' } })
    await wrapper.find('[data-testid="search-clear"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([''])
  })
})
