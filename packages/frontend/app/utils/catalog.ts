import type { CatalogSort as SharedCatalogSort } from '@echbox/shared'

export type CatalogSort = SharedCatalogSort

export type CatalogItem = {
  title: string
  likes?: number
  dislikes?: number
}

export const catalogSortOptions: { label: string, value: CatalogSort, icon: string }[] = [
  { label: 'Recent', value: 'recent', icon: 'i-lucide-clock' },
  { label: 'Top rated', value: 'top', icon: 'i-lucide-flame' },
  { label: 'A–Z', value: 'title', icon: 'i-lucide-arrow-down-a-z' },
]

/** Taggable catalogs have no titles, so they do not offer A–Z. */
export const taggableCatalogSortOptions = catalogSortOptions.filter(option => option.value !== 'title')

function score(item: CatalogItem): number {
  return (item.likes ?? 0) - (item.dislikes ?? 0)
}

/**
 * Client-side search + sort for library listings.
 * `recent` keeps the server order, which is newest first.
 */
export function filterCatalog<T extends CatalogItem>(
  items: readonly T[],
  query: string,
  sort: CatalogSort,
  fields: (item: T) => (string | null | undefined)[] = item => [item.title],
): T[] {
  const needle = query.trim().toLowerCase()
  const matched = needle
    ? items.filter(item =>
        fields(item).some(value => value?.toLowerCase().includes(needle)),
      )
    : [...items]

  if (sort === 'top') {
    matched.sort((a, b) => score(b) - score(a))
  }
  else if (sort === 'title') {
    matched.sort((a, b) => a.title.localeCompare(b.title))
  }
  return matched
}
