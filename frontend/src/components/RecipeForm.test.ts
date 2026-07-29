// frontend/src/components/RecipeForm.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RecipeForm from './RecipeForm.vue'
import IngredientDrawer from './IngredientDrawer.vue'

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

  describe('import review', () => {
    it('does not render the imported banner when isImportReview is false/omitted', () => {
      const wrapper = mount(RecipeForm)
      expect(wrapper.find('[data-testid="import-review-banner"]').exists()).toBe(false)
    })

    it('renders the imported banner with the exact copy when isImportReview is true', () => {
      const wrapper = mount(RecipeForm, { props: { isImportReview: true } })
      const banner = wrapper.find('[data-testid="import-review-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Imported — please review')
    })

    it('blocks Save even with a fully valid form until the confirm-review checkbox is checked', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          isImportReview: true,
          initialData: {
            title: 'Pancakes',
            ingredients: [{ name: 'flour', quantity: '2', unit: 'cup' }],
            steps: [{ order: 1, instruction: 'Mix it all together' }],
          },
        },
      })
      const saveBtn = wrapper.find('button[type="submit"]')
      expect(saveBtn.attributes('disabled')).toBeDefined()

      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeFalsy()
    })

    it('enables Save and emits a clean submit payload once the confirm-review checkbox is checked and the form is valid', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          isImportReview: true,
          initialData: {
            title: 'Pancakes',
            ingredients: [{ name: 'flour', quantity: '2', unit: 'cup' }],
            steps: [{ order: 1, instruction: 'Mix it all together' }],
          },
        },
      })

      const confirmCheckbox = wrapper.find('[data-testid="import-review-confirm"]')
      expect(confirmCheckbox.exists()).toBe(true)
      await confirmCheckbox.setValue(true)

      const saveBtn = wrapper.find('button[type="submit"]')
      expect(saveBtn.attributes('disabled')).toBeUndefined()

      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeTruthy()
      const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>
      expect(Object.keys(payload).sort()).toEqual(
        [
          'cook_time_minutes',
          'description',
          'ingredients',
          'prep_time_minutes',
          'recipe_source',
          'servings',
          'steps',
          'tags',
          'title',
          'visibility',
          'waiting_time_minutes',
        ].sort(),
      )
    })

    it('has zero effect on isValid/submit when isImportReview is false, regardless of confirm state', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          isImportReview: false,
          initialData: {
            title: 'Pancakes',
            ingredients: [{ name: 'flour', quantity: '2', unit: 'cup' }],
            steps: [{ order: 1, instruction: 'Mix it all together' }],
          },
        },
      })
      expect(wrapper.find('[data-testid="import-review-confirm"]').exists()).toBe(false)

      const saveBtn = wrapper.find('button[type="submit"]')
      expect(saveBtn.attributes('disabled')).toBeUndefined()

      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeTruthy()
    })
  })

  describe('drag-reorder', () => {
    it('reindexes step.order sequentially (1..n) after reordering via Move down', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            title: 'Pancakes',
            ingredients: [{ name: 'flour', quantity: '2', unit: 'cup' }],
            steps: [
              { order: 1, instruction: 'First step' },
              { order: 2, instruction: 'Second step' },
              { order: 3, instruction: 'Third step' },
            ],
          },
        },
      })

      // Steps section: find its Move down buttons (second fieldset/DragList).
      const stepsSection = wrapper.findAll('fieldset')[1]
      expect(stepsSection).toBeDefined()
      const moveDownBtns = stepsSection!.findAll('[aria-label="Move down"]')
      await moveDownBtns[0]!.trigger('click') // move "First step" down past "Second step"

      await wrapper.find('form').trigger('submit')
      const payload = wrapper.emitted('submit')?.[0]?.[0] as {
        steps: { order: number; instruction: string }[]
      }
      expect(payload.steps.map((s) => s.instruction)).toEqual([
        'Second step',
        'First step',
        'Third step',
      ])
      expect(payload.steps.map((s) => s.order)).toEqual([1, 2, 3])
    })

    it('reorders ingredients preserving data with no loss/duplication', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            title: 'Pancakes',
            ingredients: [
              { name: 'flour', quantity: '2', unit: 'cup' },
              { name: 'sugar', quantity: '1', unit: 'cup' },
              { name: 'egg', quantity: '2', unit: null },
            ],
            steps: [{ order: 1, instruction: 'Mix it all together' }],
          },
        },
      })

      const ingredientsSection = wrapper.findAll('fieldset')[0]
      expect(ingredientsSection).toBeDefined()
      const moveUpBtns = ingredientsSection!.findAll('[aria-label="Move up"]')
      // moveUpBtns[0] is row 0 (disabled), moveUpBtns[1] is row 1 ("sugar")
      await moveUpBtns[1]!.trigger('click')

      await wrapper.find('form').trigger('submit')
      const payload = wrapper.emitted('submit')?.[0]?.[0] as {
        ingredients: { name: string; quantity: string; unit: string | null }[]
      }
      expect(payload.ingredients).toEqual([
        { name: 'sugar', quantity: '1', unit: 'cup' },
        { name: 'flour', quantity: '2', unit: 'cup' },
        { name: 'egg', quantity: '2', unit: null },
      ])
    })

    it('does not leak the local stable-id field into the emitted submit payload', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            title: 'Pancakes',
            ingredients: [
              { name: 'flour', quantity: '2', unit: 'cup' },
              { name: 'sugar', quantity: '1', unit: 'cup' },
            ],
            steps: [
              { order: 1, instruction: 'First step' },
              { order: 2, instruction: 'Second step' },
            ],
          },
        },
      })

      await wrapper.find('form').trigger('submit')
      const payload = wrapper.emitted('submit')?.[0]?.[0] as {
        ingredients: Record<string, unknown>[]
        steps: Record<string, unknown>[]
      }

      for (const ing of payload.ingredients) {
        expect(Object.keys(ing).sort()).toEqual(['name', 'quantity', 'unit'])
      }
      for (const step of payload.steps) {
        expect(Object.keys(step).sort()).toEqual(['instruction', 'order'])
      }
    })

    it('still opens the correct ingredient in the drawer after a reorder (click-to-edit identity)', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            title: 'Pancakes',
            ingredients: [
              { name: 'flour', quantity: '2', unit: 'cup' },
              { name: 'sugar', quantity: '1', unit: 'cup' },
            ],
            steps: [{ order: 1, instruction: 'Mix it all together' }],
          },
        },
      })

      const ingredientsSection = wrapper.findAll('fieldset')[0]
      expect(ingredientsSection).toBeDefined()
      const moveDownBtns = ingredientsSection!.findAll('[aria-label="Move down"]')
      await moveDownBtns[0]!.trigger('click') // "flour" moves to index 1, "sugar" to index 0

      // Click what is now the first row's content (should be "sugar").
      const rows = ingredientsSection!.findAll('[data-drag-row]')
      await rows[0]?.find('.recipe-form__list-item').trigger('click')

      const drawer = wrapper.findComponent(IngredientDrawer)
      expect(drawer.exists()).toBe(true)
      expect(drawer.props('ingredient')).toEqual({ name: 'sugar', quantity: '1', unit: 'cup' })
    })
  })

  describe('recipe source', () => {
    const validBase = {
      title: 'Pancakes',
      ingredients: [{ name: 'flour', quantity: '2', unit: 'cup' }],
      steps: [{ order: 1, instruction: 'Mix it all together' }],
    }

    function submittedSource(wrapper: ReturnType<typeof mount>) {
      const payload = wrapper.emitted('submit')?.[0]?.[0] as {
        recipe_source: unknown
      }
      return payload.recipe_source
    }

    it('prefills the source input with the url from an imported recipe', () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            ...validBase,
            recipe_source: { type: 'url', url: 'https://example.com/pancakes' },
          },
        },
      })
      const input = wrapper.find('[data-testid="source-input"]')
        .element as HTMLInputElement
      expect(input.value).toBe('https://example.com/pancakes')
    })

    // Regression guard: RecipeForm previously never emitted recipe_source, so
    // editing an imported recipe dropped it from the payload entirely. It only
    // survived because the backend coalesces null to the existing value.
    it('round-trips an existing url source through submit without dropping it', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            ...validBase,
            recipe_source: { type: 'url', url: 'https://example.com/pancakes' },
          },
        },
      })
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({
        type: 'url',
        url: 'https://example.com/pancakes',
      })
    })

    it('classifies a typed http url as a url source', async () => {
      const wrapper = mount(RecipeForm, { props: { initialData: validBase } })
      await wrapper.find('[data-testid="source-input"]').setValue('https://foo.test/r/1')
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({ type: 'url', url: 'https://foo.test/r/1' })
    })

    it('classifies free text as a book source', async () => {
      const wrapper = mount(RecipeForm, { props: { initialData: validBase } })
      await wrapper.find('[data-testid="source-input"]').setValue('Salt Fat Acid Heat')
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({
        type: 'book',
        book_title: 'Salt Fat Acid Heat',
      })
    })

    it('prefills and preserves an existing page number when the book title is edited', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            ...validBase,
            recipe_source: { type: 'book', book_title: 'Old Title', page: 142 },
          },
        },
      })
      const pageInput = wrapper.find('[data-testid="source-page-input"]')
      expect((pageInput.element as HTMLInputElement).value).toBe('142')

      await wrapper.find('[data-testid="source-input"]').setValue('New Title')
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({
        type: 'book',
        book_title: 'New Title',
        page: 142,
      })
    })

    it('lets the user enter a page number for a book source', async () => {
      const wrapper = mount(RecipeForm, { props: { initialData: validBase } })
      await wrapper.find('[data-testid="source-input"]').setValue('Salt Fat Acid Heat')
      await wrapper.find('[data-testid="source-page-input"]').setValue(142)
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({
        type: 'book',
        book_title: 'Salt Fat Acid Heat',
        page: 142,
      })
    })

    it('lets the user change an existing page number', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            ...validBase,
            recipe_source: { type: 'book', book_title: 'Salt Fat Acid Heat', page: 142 },
          },
        },
      })
      await wrapper.find('[data-testid="source-page-input"]').setValue(88)
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({
        type: 'book',
        book_title: 'Salt Fat Acid Heat',
        page: 88,
      })
    })

    it('omits page when the book source has none', async () => {
      const wrapper = mount(RecipeForm, { props: { initialData: validBase } })
      await wrapper.find('[data-testid="source-input"]').setValue('Salt Fat Acid Heat')
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({
        type: 'book',
        book_title: 'Salt Fat Acid Heat',
      })
    })

    it('hides the page input for a url source', async () => {
      const wrapper = mount(RecipeForm, { props: { initialData: validBase } })
      await wrapper.find('[data-testid="source-input"]').setValue('Salt Fat Acid Heat')
      expect(wrapper.find('[data-testid="source-page-input"]').exists()).toBe(true)

      await wrapper.find('[data-testid="source-input"]').setValue('https://foo.test/r/1')
      expect(wrapper.find('[data-testid="source-page-input"]').exists()).toBe(false)
    })

    // A page typed against a book, then switched to a link, must not ride
    // along into the url payload.
    it('drops a stale page when a book source is changed to a url', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            ...validBase,
            recipe_source: { type: 'book', book_title: 'Salt Fat Acid Heat', page: 142 },
          },
        },
      })
      await wrapper.find('[data-testid="source-input"]').setValue('https://foo.test/r/1')
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toEqual({ type: 'url', url: 'https://foo.test/r/1' })
    })

    it('emits a null source when the field is left empty', async () => {
      const wrapper = mount(RecipeForm, { props: { initialData: validBase } })
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toBeNull()
    })

    it('emits a null source when the user clears a previously set source', async () => {
      const wrapper = mount(RecipeForm, {
        props: {
          initialData: {
            ...validBase,
            recipe_source: { type: 'url', url: 'https://example.com/pancakes' },
          },
        },
      })
      await wrapper.find('[data-testid="source-input"]').setValue('   ')
      await wrapper.find('form').trigger('submit')
      expect(submittedSource(wrapper)).toBeNull()
    })

    it('shows the detected type in the hint as the user types', async () => {
      const wrapper = mount(RecipeForm, { props: { initialData: validBase } })
      const hint = () => wrapper.find('[data-testid="source-hint"]').text()

      await wrapper.find('[data-testid="source-input"]').setValue('https://foo.test')
      expect(hint()).toContain('link')

      await wrapper.find('[data-testid="source-input"]').setValue('My Cookbook')
      expect(hint()).toContain('book')
    })
  })
})
