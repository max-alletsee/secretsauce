// frontend/src/components/base/DragList.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DragList from './DragList.vue'

type Item = { id: number; label: string }

const items: Item[] = [
  { id: 1, label: 'First' },
  { id: 2, label: 'Second' },
  { id: 3, label: 'Third' },
]

describe('DragList', () => {
  it('renders a row for each item', () => {
    const wrapper = mount(DragList, {
      props: { items, keyField: 'id' },
      slots: { default: '<span>item</span>' },
    })
    const rows = wrapper.findAll('[data-drag-row]')
    expect(rows.length).toBe(3)
  })

  it('emits update:items with rows swapped when "Move down" pressed on first row', async () => {
    const wrapper = mount(DragList, {
      props: { items, keyField: 'id' },
      slots: { default: '<span>item</span>' },
    })

    // First row's "Move down" button
    const moveDownBtn = wrapper.find('[aria-label="Move down"]')
    await moveDownBtn.trigger('click')

    const emitted = wrapper.emitted('update:items')
    expect(emitted).toBeTruthy()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const reordered = emitted![0]![0] as Item[]
    expect(reordered[0]).toEqual({ id: 2, label: 'Second' })
    expect(reordered[1]).toEqual({ id: 1, label: 'First' })
    expect(reordered[2]).toEqual({ id: 3, label: 'Third' })
  })

  it('emits update:items with rows swapped when "Move up" pressed on second row', async () => {
    const wrapper = mount(DragList, {
      props: { items, keyField: 'id' },
      slots: { default: '<span>item</span>' },
    })

    // Second row's "Move up" button (aria-label="Move up")
    const allMoveUpBtns = wrapper.findAll('[aria-label="Move up"]')
    // allMoveUpBtns[0] is row 0 (disabled), allMoveUpBtns[1] is row 1 (second row)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await allMoveUpBtns[1]!.trigger('click')

    const emitted = wrapper.emitted('update:items')
    expect(emitted).toBeTruthy()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const reordered = emitted![0]![0] as Item[]
    expect(reordered[0]).toEqual({ id: 2, label: 'Second' })
    expect(reordered[1]).toEqual({ id: 1, label: 'First' })
    expect(reordered[2]).toEqual({ id: 3, label: 'Third' })
  })

  it('disables "Move up" button on first row', () => {
    const wrapper = mount(DragList, {
      props: { items, keyField: 'id' },
      slots: { default: '<span>item</span>' },
    })
    const rows = wrapper.findAll('[data-drag-row]')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstRowMoveUp = rows[0]!.find('[aria-label="Move up"]')
    if (firstRowMoveUp.exists()) {
      expect(firstRowMoveUp.attributes('disabled')).toBeDefined()
    } else {
      // Button not rendered — also acceptable
      expect(true).toBe(true)
    }
  })

  it('disables "Move down" button on last row', () => {
    const wrapper = mount(DragList, {
      props: { items, keyField: 'id' },
      slots: { default: '<span>item</span>' },
    })
    const rows = wrapper.findAll('[data-drag-row]')
    const lastRow = rows[rows.length - 1]
    expect(lastRow).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRowMoveDown = lastRow!.find('[aria-label="Move down"]')
    if (lastRowMoveDown.exists()) {
      expect(lastRowMoveDown.attributes('disabled')).toBeDefined()
    } else {
      // Button not rendered — also acceptable
      expect(true).toBe(true)
    }
  })

  it('exposes item and index via slot props', () => {
    const wrapper = mount(DragList, {
      props: { items, keyField: 'id' },
      slots: {
        default: `<template #default="{ item, index }">
          <span class="label">{{ item.label }}-{{ index }}</span>
        </template>`,
      },
    })
    const labels = wrapper.findAll('.label').map((el) => el.text())
    expect(labels).toEqual(['First-0', 'Second-1', 'Third-2'])
  })

  it('emits update:items with correct reorder when "Move down" pressed on middle row', async () => {
    const wrapper = mount(DragList, {
      props: { items, keyField: 'id' },
      slots: { default: '<span>item</span>' },
    })

    const rows = wrapper.findAll('[data-drag-row]')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const secondRowMoveDown = rows[1]!.find('[aria-label="Move down"]')
    await secondRowMoveDown.trigger('click')

    const emitted = wrapper.emitted('update:items')
    expect(emitted).toBeTruthy()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const reordered = emitted![0]![0] as Item[]
    expect(reordered[0]).toEqual({ id: 1, label: 'First' })
    expect(reordered[1]).toEqual({ id: 3, label: 'Third' })
    expect(reordered[2]).toEqual({ id: 2, label: 'Second' })
  })
})
