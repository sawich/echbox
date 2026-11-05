import { describe, expect, test } from 'bun:test'
import { aggregatePageTags, groupPageTagsByCategory } from './page-tags'

describe('aggregatePageTags', () => {
  test('counts unique tag names and sorts by category then name', () => {
    const result = aggregatePageTags([
      {
        tags: [
          { name: 'zelda', category: 'franchise' },
          { name: 'blonde_hair', category: 'general' },
        ],
      },
      {
        tags: [
          { name: 'blonde_hair', category: 'general' },
          { name: 'alice', category: 'character' },
        ],
      },
      { tags: [{ name: 'alice', category: 'character' }] },
      {},
    ])

    expect(result).toEqual([
      { name: 'alice', category: 'character', count: 2 },
      { name: 'zelda', category: 'franchise', count: 1 },
      { name: 'blonde_hair', category: 'general', count: 2 },
    ])
  })
})

describe('groupPageTagsByCategory', () => {
  test('groups in category order and omits empty categories', () => {
    const result = groupPageTagsByCategory([
      { name: 'alice', category: 'character', count: 2 },
      { name: 'bob', category: 'character', count: 1 },
      { name: 'zelda', category: 'franchise', count: 1 },
      { name: 'blonde_hair', category: 'general', count: 2 },
    ])

    expect(result).toEqual([
      {
        category: 'character',
        tags: [
          { name: 'alice', category: 'character', count: 2 },
          { name: 'bob', category: 'character', count: 1 },
        ],
      },
      {
        category: 'franchise',
        tags: [{ name: 'zelda', category: 'franchise', count: 1 }],
      },
      {
        category: 'general',
        tags: [{ name: 'blonde_hair', category: 'general', count: 2 }],
      },
    ])
  })
})
