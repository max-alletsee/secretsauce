// frontend/src/components/base/moveItem.test.ts
import { describe, expect, it } from 'vitest'
import { moveItem } from './moveItem'

describe('moveItem', () => {
  it('moves index 0 to index 2 and preserves all elements', () => {
    const input = ['a', 'b', 'c', 'd']
    const result = moveItem(input, 0, 2)
    expect(result).toEqual(['b', 'c', 'a', 'd'])
    expect(result.length).toBe(4)
  })

  it('moves index 2 to index 1 (moving up) and reindexes correctly', () => {
    const input = ['a', 'b', 'c', 'd']
    const result = moveItem(input, 2, 1)
    expect(result).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves index 1 to index 2 (moving down) and reindexes correctly', () => {
    const input = ['a', 'b', 'c', 'd']
    const result = moveItem(input, 1, 2)
    expect(result).toEqual(['a', 'c', 'b', 'd'])
  })

  it('does not mutate the original array', () => {
    const input = ['a', 'b', 'c']
    const copy = [...input]
    moveItem(input, 0, 1)
    expect(input).toEqual(copy)
  })

  it('returns a shallow copy when from === to', () => {
    const input = ['a', 'b', 'c']
    const result = moveItem(input, 1, 1)
    expect(result).toEqual(['a', 'b', 'c'])
    expect(result).not.toBe(input) // new array
  })

  it('returns a shallow copy unchanged when from is out of bounds (negative)', () => {
    const input = ['a', 'b', 'c']
    const result = moveItem(input, -1, 1)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns a shallow copy unchanged when from is out of bounds (>= length)', () => {
    const input = ['a', 'b', 'c']
    const result = moveItem(input, 3, 1)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns a shallow copy unchanged when to is out of bounds (negative)', () => {
    const input = ['a', 'b', 'c']
    const result = moveItem(input, 0, -1)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns a shallow copy unchanged when to is out of bounds (>= length)', () => {
    const input = ['a', 'b', 'c']
    const result = moveItem(input, 0, 3)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('works with objects (preserves same references)', () => {
    const a = { id: 1, name: 'first' }
    const b = { id: 2, name: 'second' }
    const c = { id: 3, name: 'third' }
    const input = [a, b, c]
    const result = moveItem(input, 0, 2)
    expect(result[0]).toBe(b)
    expect(result[1]).toBe(c)
    expect(result[2]).toBe(a)
  })
})
