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

/** Stay on the upload form when a post-create tag or preview step fails. */
export function postCreateFollowUp(errors: Array<string | null | undefined>): {
  navigate: boolean
  error: string | null
} {
  const messages = errors.filter((error): error is string => Boolean(error))
  if (messages.length === 0) return { navigate: true, error: null }
  return {
    navigate: false,
    error: `Published, but extras were not saved: ${messages.join(' ')}`,
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
): Promise<{ error: string | null, uploaded: number }> {
  const base = apiUrl.replace(/\/$/, '')
  let uploaded = 0
  for (const file of files.slice(0, 3)) {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${base}/api/softmods/${encodeURIComponent(id)}/previews`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      return {
        error: body?.error || `Preview upload failed (${res.status})`,
        uploaded,
      }
    }
    uploaded += 1
  }
  return { error: null, uploaded }
}
