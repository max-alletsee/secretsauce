// frontend/src/components/base/BaseInput.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseInput from './BaseInput.vue'

describe('BaseInput', () => {
  it('renders an <input> element', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '' } })
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('defaults to type="text" when no type is provided', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '' } })
    expect(wrapper.find('input').attributes('type')).toBe('text')
  })

  it('uses the provided type prop', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', type: 'email' } })
    expect(wrapper.find('input').attributes('type')).toBe('email')
  })

  it('reflects modelValue in the input value', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: 'hello' } })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('hello')
  })

  it('emits update:modelValue when input event fires', async () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '' } })
    await wrapper.find('input').setValue('new value')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['new value'])
  })

  it('renders a label when label prop is provided', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', label: 'Recipe name' } })
    expect(wrapper.find('label').exists()).toBe(true)
    expect(wrapper.find('label').text()).toBe('Recipe name')
  })

  it('does not render a label when label prop is omitted', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '' } })
    expect(wrapper.find('label').exists()).toBe(false)
  })

  it('associates label with input via for/id', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', label: 'Title' } })
    const labelFor = wrapper.find('label').attributes('for')
    const inputId = wrapper.find('input').attributes('id')
    expect(labelFor).toBeTruthy()
    expect(inputId).toBeTruthy()
    expect(labelFor).toBe(inputId)
  })

  it('uses the provided id prop for the input id', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', id: 'my-input', label: 'Title' } })
    expect(wrapper.find('input').attributes('id')).toBe('my-input')
    expect(wrapper.find('label').attributes('for')).toBe('my-input')
  })

  it('does not render error text when error prop is absent', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '' } })
    expect(wrapper.find('.input__error').exists()).toBe(false)
  })

  it('renders error text when error prop is provided', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', error: 'This field is required' } })
    expect(wrapper.find('.input__error').exists()).toBe(true)
    expect(wrapper.find('.input__error').text()).toBe('This field is required')
  })

  it('sets aria-invalid="true" when error is present', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', error: 'Bad value' } })
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('does not set aria-invalid when error is absent', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '' } })
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('wires aria-describedby to the error element id', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', error: 'Oops' } })
    const describedBy = wrapper.find('input').attributes('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(wrapper.find('.input__error').attributes('id')).toBe(describedBy)
  })

  it('visually hides the error text but keeps it in the DOM when hideErrorText is true', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '', error: 'Invalid email or password.', hideErrorText: true },
    })
    const errorSpan = wrapper.find('.input__error')
    expect(errorSpan.exists()).toBe(true)
    expect(errorSpan.text()).toBe('Invalid email or password.')
    expect(errorSpan.classes()).toContain('sr-only')
    expect(wrapper.find('input').attributes('aria-describedby')).toBe(errorSpan.attributes('id'))
  })

  it('does not hide the error text when hideErrorText is false or omitted', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', error: 'Oops' } })
    expect(wrapper.find('.input__error').classes()).not.toContain('sr-only')
  })

  it('forwards placeholder prop', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', placeholder: 'Enter title…' } })
    expect(wrapper.find('input').attributes('placeholder')).toBe('Enter title…')
  })

  it('sets required attribute when required prop is true', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', required: true } })
    expect(wrapper.find('input').attributes('required')).toBeDefined()
  })
})
