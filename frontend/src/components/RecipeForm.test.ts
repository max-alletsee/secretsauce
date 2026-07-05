// frontend/src/components/RecipeForm.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RecipeForm from './RecipeForm.vue'

describe('RecipeForm', () => {
  it('does not show validation hints before a save attempt, even though the form is invalid', () => {
    const wrapper = mount(RecipeForm)
    expect(wrapper.find('[data-testid="title-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ingredients-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="steps-hint"]').exists()).toBe(false)
  })

  it('keeps the Save button disabled while the form is invalid', () => {
    const wrapper = mount(RecipeForm)
    const saveBtn = wrapper.find('button[type="submit"]')
    expect(saveBtn.attributes('disabled')).toBeDefined()
  })

  it('shows all three hints after clicking Save on a fully empty form', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[data-testid="title-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="title-hint"]').text()).toContain('Title is required')
    expect(wrapper.find('[data-testid="ingredients-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="steps-hint"]').exists()).toBe(true)
  })

  it('does not emit submit when the form is invalid and Save is clicked', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('hides the title hint once a title is filled in, even after a failed submit attempt', async () => {
    const wrapper = mount(RecipeForm)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[data-testid="title-hint"]').exists()).toBe(true)

    await wrapper.find('#recipe-title').setValue('Pancakes')
    expect(wrapper.find('[data-testid="title-hint"]').exists()).toBe(false)
  })

  it('does not show the ingredients/steps hint when initialData already has entries', () => {
    const wrapper = mount(RecipeForm, {
      props: {
        initialData: {
          title: 'Pancakes',
          ingredients: [{ name: 'flour', quantity: '2', unit: 'cup' }],
          steps: [{ order: 1, instruction: 'Mix it all together' }],
        },
      },
    })
    expect(wrapper.find('[data-testid="ingredients-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="steps-hint"]').exists()).toBe(false)
  })

  it('emits submit with trimmed data when the form is valid and Save is clicked', async () => {
    const wrapper = mount(RecipeForm, {
      props: {
        initialData: {
          title: '  Pancakes  ',
          ingredients: [{ name: 'flour', quantity: '2', unit: 'cup' }],
          steps: [{ order: 1, instruction: 'Mix it all together' }],
        },
      },
    })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeTruthy()
    const payload = wrapper.emitted('submit')?.[0]?.[0] as { title: string }
    expect(payload.title).toBe('Pancakes')
  })

  it('emits cancel when the Cancel button is clicked', async () => {
    const wrapper = mount(RecipeForm)
    const buttons = wrapper.findAll('button')
    const cancelBtn = buttons.find((b) => b.text() === 'Cancel')
    await cancelBtn?.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
