// frontend/src/components/base/BaseTextarea.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseTextarea from './BaseTextarea.vue'

describe('BaseTextarea', () => {
  it('renders a <textarea> element', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '' } })
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('reflects modelValue in the textarea value', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: 'some notes' } })
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('some notes')
  })

  it('emits update:modelValue when input event fires', async () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '' } })
    await wrapper.find('textarea').setValue('typed text')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['typed text'])
  })

  it('renders a label when label prop is provided', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', label: 'Notes' } })
    expect(wrapper.find('label').exists()).toBe(true)
    expect(wrapper.find('label').text()).toBe('Notes')
  })

  it('does not render a label when label prop is omitted', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '' } })
    expect(wrapper.find('label').exists()).toBe(false)
  })

  it('associates label with textarea via for/id', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', label: 'Notes' } })
    const labelFor = wrapper.find('label').attributes('for')
    const textareaId = wrapper.find('textarea').attributes('id')
    expect(labelFor).toBeTruthy()
    expect(textareaId).toBeTruthy()
    expect(labelFor).toBe(textareaId)
  })

  it('uses the provided id prop for the textarea id', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', id: 'my-textarea', label: 'Notes' } })
    expect(wrapper.find('textarea').attributes('id')).toBe('my-textarea')
    expect(wrapper.find('label').attributes('for')).toBe('my-textarea')
  })

  it('does not render error text when error prop is absent', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '' } })
    expect(wrapper.find('.textarea__error').exists()).toBe(false)
  })

  it('renders error text when error prop is provided', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', error: 'Cannot be empty' } })
    expect(wrapper.find('.textarea__error').exists()).toBe(true)
    expect(wrapper.find('.textarea__error').text()).toBe('Cannot be empty')
  })

  it('sets aria-invalid="true" when error is present', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', error: 'Bad value' } })
    expect(wrapper.find('textarea').attributes('aria-invalid')).toBe('true')
  })

  it('does not set aria-invalid when error is absent', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '' } })
    expect(wrapper.find('textarea').attributes('aria-invalid')).toBeUndefined()
  })

  it('wires aria-describedby to the error element id', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', error: 'Oops' } })
    const describedBy = wrapper.find('textarea').attributes('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(wrapper.find('.textarea__error').attributes('id')).toBe(describedBy)
  })

  it('forwards placeholder prop', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', placeholder: 'Add notes…' } })
    expect(wrapper.find('textarea').attributes('placeholder')).toBe('Add notes…')
  })

  it('sets required attribute when required prop is true', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', required: true } })
    expect(wrapper.find('textarea').attributes('required')).toBeDefined()
  })

  it('forwards rows prop to textarea', () => {
    const wrapper = mount(BaseTextarea, { props: { modelValue: '', rows: 6 } })
    expect(wrapper.find('textarea').attributes('rows')).toBe('6')
  })
})
