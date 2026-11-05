import { describe, expect, test } from 'bun:test'
import {
  commitTagChip,
  emptyTagFilter,
  enterTagFilter,
  flushTagFilter,
  normalizeTagDraft,
  removeTagChip,
  tagFilterQuery,
  typeTagDraft,
  type TagFilterSnapshot,
} from './tag-filter'

function snap(partial: Partial<TagFilterSnapshot> = {}): TagFilterSnapshot {
  return { ...emptyTagFilter(), ...partial }
}

describe('normalizeTagDraft', () => {
  test('trims, lowercases, and turns spaces into underscores', () => {
    expect(normalizeTagDraft(' Hatsune Miku ')).toBe('hatsune_miku')
  })

  test('collapses repeated spaces and underscores', () => {
    expect(normalizeTagDraft('a  b__c')).toBe('a_b_c')
  })

  test('rejects punctuation and blank input', () => {
    expect(normalizeTagDraft('bad!')).toBeNull()
    expect(normalizeTagDraft('   ')).toBeNull()
  })
})

describe('tag filter apply', () => {
  test('Enter on an empty draft applies the current chips immediately', () => {
    const next = enterTagFilter(
      snap({ selected: ['red'], draft: '   ', applied: [], applyAt: 9_000 }),
      1_000,
    )

    expect(next.applied).toEqual(['red'])
    expect(next.selected).toEqual(['red'])
    expect(next.applyAt).toBeNull()
  })

  test('typing does not apply, and a later keystroke postpones the deadline', () => {
    const committed = commitTagChip(snap({ draft: 'red' }), 0)
    const typing = typeTagDraft(committed, 'hair', 100)

    expect(typing.selected).toEqual(['red'])
    expect(typing.draft).toBe('hair')
    expect(flushTagFilter(typing, 250).applied).toEqual([])
    expect(flushTagFilter(typing, 349).applied).toEqual([])

    const due = flushTagFilter(typing, 350)
    expect(due.applied).toEqual(['red'])
    expect(due.applyAt).toBeNull()
  })

  test('committing a chip adds it before the debounced apply', () => {
    const committed = commitTagChip(snap({ draft: 'Hatsune Miku' }), 0)

    expect(committed.selected).toEqual(['hatsune_miku'])
    expect(committed.draft).toBe('')
    expect(committed.applied).toEqual([])
    expect(flushTagFilter(committed, 249).applied).toEqual([])
    expect(flushTagFilter(committed, 250).applied).toEqual(['hatsune_miku'])
  })

  test('Enter on a non-empty draft commits the chip and waits to apply', () => {
    const next = enterTagFilter(snap({ draft: 'blonde hair' }), 0)

    expect(next.selected).toEqual(['blonde_hair'])
    expect(next.applied).toEqual([])
    expect(next.applyAt).toBe(250)
  })

  test('a resolver turns an alias into the canonical name on commit', () => {
    const next = commitTagChip(
      snap({ draft: 'miku' }),
      0,
      'miku',
      name => (name === 'miku' ? 'hatsune_miku' : name),
    )

    expect(next.selected).toEqual(['hatsune_miku'])
  })

  test('does not add a chip that is already selected', () => {
    const next = commitTagChip(snap({ selected: ['red'], draft: 'red' }), 0)

    expect(next.selected).toEqual(['red'])
    expect(next.draft).toBe('')
  })

  test('invalid input does not change the selection', () => {
    const next = enterTagFilter(snap({ draft: 'bad!' }), 0)

    expect(next.selected).toEqual([])
    expect(next.applied).toEqual([])
    expect(next.draft).toBe('bad!')
  })

  test('removing a chip updates the selection and applies on the debounce', () => {
    const removed = removeTagChip(
      snap({ selected: ['red', 'hair'], applied: ['red', 'hair'] }),
      'red',
      0,
    )

    expect(removed.selected).toEqual(['hair'])
    expect(removed.applied).toEqual(['red', 'hair'])
    expect(flushTagFilter(removed, 250).applied).toEqual(['hair'])
  })
})

describe('tagFilterQuery', () => {
  test('sends comma-separated names and omits an empty filter', () => {
    expect(tagFilterQuery(['red', 'hair'])).toEqual({ tags: 'red,hair' })
    expect(tagFilterQuery([])).toEqual({})
  })
})
