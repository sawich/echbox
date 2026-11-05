import { describe, expect, test } from 'bun:test'
import { aggregatePageTags } from './page-tags'

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
