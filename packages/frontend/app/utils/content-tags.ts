import type { TaggableContentKind } from '@echbox/shared'

export function contentTagsPath(kind: TaggableContentKind, id: string) {
  const encoded = encodeURIComponent(id)
  switch (kind) {
    case 'cards':
      return `/api/kk/cards/${encoded}/tags`
    case 'scenes':
      return `/api/scenes/${encoded}/tags`
    case 'clothes':
      return `/api/clothes/${encoded}/tags`
    case 'softmods':
      return `/api/softmods/${encoded}/tags`
  }
}

export async function replaceContentTags(
  apiUrl: string,
  kind: TaggableContentKind,
  id: string,
  tags: string[],
): Promise<string | null> {
  if (tags.length === 0) return null
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}${contentTagsPath(kind, id)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tags }),
  })
  if (res.ok) return null
  const body = await res.json().catch(() => null) as { error?: string } | null
  return body?.error || `Could not save tags (${res.status})`
}

export async function uploadSoftmodPreviews(
  apiUrl: string,
  id: string,
  files: File[],
): Promise<string | null> {
  const base = apiUrl.replace(/\/$/, '')
  for (const file of files.slice(0, 3)) {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${base}/api/softmods/${encodeURIComponent(id)}/previews`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (res.ok) continue
    const body = await res.json().catch(() => null) as { error?: string } | null
    return body?.error || `Preview upload failed (${res.status})`
  }
  return null
}
