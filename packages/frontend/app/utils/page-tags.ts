import type { TagCategory } from '@echbox/shared'

const CATEGORY_ORDER: readonly TagCategory[] = [
  'author',
  'license',
  'character',
  'franchise',
  'general',
]

export type PageTagRef = {
  name: string
  category: TagCategory
}

export type PageTagCount = PageTagRef & {
  count: number
}

export function aggregatePageTags(
  items: { tags?: PageTagRef[] }[],
): PageTagCount[] {
  const counts = new Map<string, PageTagCount>()
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const existing = counts.get(tag.name)
      if (existing) {
        existing.count += 1
        continue
      }
      counts.set(tag.name, {
        name: tag.name,
        category: tag.category,
        count: 1,
      })
    }
  }

  return [...counts.values()].sort((a, b) => {
    const catDiff
      = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    if (catDiff !== 0) return catDiff
    return a.name.localeCompare(b.name)
  })
}
