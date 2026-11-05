export const TAG_FILTER_DEBOUNCE_MS = 250

const CANONICAL_TAG_NAME = /^[a-z0-9_]+$/

export type TagNameResolver = (normalized: string) => string | null

export type TagFilterSnapshot = {
  selected: readonly string[]
  draft: string
  applied: readonly string[]
  applyAt: number | null
}

export function normalizeTagDraft(raw: string): string | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')

  if (normalized === '' || !CANONICAL_TAG_NAME.test(normalized)) return null
  return normalized
}

export function emptyTagFilter(): TagFilterSnapshot {
  return { selected: [], draft: '', applied: [], applyAt: null }
}

function schedule(state: TagFilterSnapshot, now: number): TagFilterSnapshot {
  return { ...state, applyAt: now + TAG_FILTER_DEBOUNCE_MS }
}

export function typeTagDraft(state: TagFilterSnapshot, draft: string, now: number): TagFilterSnapshot {
  return schedule({ ...state, draft }, now)
}

export function commitTagChip(
  state: TagFilterSnapshot,
  now: number,
  raw: string = state.draft,
  resolve?: TagNameResolver,
): TagFilterSnapshot {
  const normalized = normalizeTagDraft(raw)
  if (!normalized) return state

  const resolved = resolve?.(normalized) ?? normalized
  const name = resolved || normalized
  const selected = state.selected.includes(name)
    ? state.selected
    : [...state.selected, name]

  return schedule({ ...state, selected, draft: '' }, now)
}

export function removeTagChip(state: TagFilterSnapshot, name: string, now: number): TagFilterSnapshot {
  if (!state.selected.includes(name)) return state
  return schedule({
    ...state,
    selected: state.selected.filter(tag => tag !== name),
  }, now)
}

export function enterTagFilter(
  state: TagFilterSnapshot,
  now: number,
  resolve?: TagNameResolver,
): TagFilterSnapshot {
  if (state.draft.trim() === '') {
    return { ...state, applied: [...state.selected], applyAt: null }
  }
  return commitTagChip(state, now, state.draft, resolve)
}

/** Apply only once `now` has reached the scheduled deadline. */
export function flushTagFilter(state: TagFilterSnapshot, now: number): TagFilterSnapshot {
  if (state.applyAt === null || now < state.applyAt) return state
  return forceApply(state)
}

/** Apply the current chips without waiting. Used when the debounce timer fires. */
export function forceApply(state: TagFilterSnapshot): TagFilterSnapshot {
  return { ...state, applied: [...state.selected], applyAt: null }
}

/** Comma-separated `tags` query. Empty selection sends no filter. */
export function tagFilterQuery(names: readonly string[]): { tags?: string } {
  if (names.length === 0) return {}
  return { tags: names.join(',') }
}
