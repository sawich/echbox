const SNIPPET_LIMIT = 80
const ID_PREFIX_LIMIT = 8

/** Task and install labels for nameless content: a short description, or an id prefix. */
export function contentLabel(description: string | null | undefined, id: string): string {
  const snippet = description?.replace(/\s+/g, ' ').trim() ?? ''
  if (snippet) {
    if (snippet.length <= SNIPPET_LIMIT) return snippet
    return `${snippet.slice(0, SNIPPET_LIMIT - 1)}…`
  }
  if (id.length <= ID_PREFIX_LIMIT) return id
  return id.slice(0, ID_PREFIX_LIMIT)
}
