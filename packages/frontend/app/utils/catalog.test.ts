import { describe, expect, test } from 'bun:test'
import { catalogSortOptions, filterCatalog, taggableCatalogSortOptions } from './catalog'

const items = [
  { title: 'Bravo', slug: 'b', likes: 1, dislikes: 0 },
  { title: 'alpha', slug: 'a', likes: 5, dislikes: 1 },
  { title: 'Charlie', slug: 'c-alpha' },
]

describe('filterCatalog', () => {
  test('recent keeps server order', () => {
    expect(filterCatalog(items, '', 'recent').map(i => i.title)).toEqual(['Bravo', 'alpha', 'Charlie'])
  })

  test('top sorts by likes minus dislikes', () => {
    expect(filterCatalog(items, '', 'top').map(i => i.title)).toEqual(['alpha', 'Bravo', 'Charlie'])
  })

  test('title sorts case-insensitively', () => {
    expect(filterCatalog(items, '', 'title').map(i => i.title)).toEqual(['alpha', 'Bravo', 'Charlie'])
  })

  test('query matches title by default', () => {
    expect(filterCatalog(items, ' ALP ', 'recent').map(i => i.title)).toEqual(['alpha'])
  })

  test('query matches custom fields', () => {
    expect(
      filterCatalog(items, 'alpha', 'recent', i => [i.title, i.slug]).map(i => i.title),
    ).toEqual(['alpha', 'Charlie'])
  })

  test('does not mutate input', () => {
    filterCatalog(items, '', 'title')
    expect(items[0]!.title).toBe('Bravo')
  })
})

describe('catalog sort options', () => {
  test('taggable toolbars offer recent and top only', () => {
    expect(taggableCatalogSortOptions.map(option => option.value)).toEqual(['recent', 'top'])
  })

  test('text search toolbars still offer title sort', () => {
    expect(catalogSortOptions.map(option => option.value)).toEqual(['recent', 'top', 'title'])
  })
})
