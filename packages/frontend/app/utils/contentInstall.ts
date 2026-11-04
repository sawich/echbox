import type { ContentKind } from '~/composables/useLocalInstalls'

export function extensionForKind(kind: ContentKind): string {
  switch (kind) {
    case 'cards':
    case 'scenes':
    case 'clothes':
      return 'png'
    case 'plugins':
      return 'zip'
    case 'softmods':
      return 'zipmod'
  }
}

export function downloadUrlFor(
  apiUrl: string,
  kind: ContentKind,
  contentId: string,
  versionId: string,
): string {
  const base = apiUrl.replace(/\/$/, '')
  switch (kind) {
    case 'cards':
      return `${base}/api/kk/cards/${encodeURIComponent(contentId)}/versions/${encodeURIComponent(versionId)}/image?original=1`
    case 'scenes':
      return `${base}/api/scenes/${encodeURIComponent(contentId)}/versions/${encodeURIComponent(versionId)}/image?original=1`
    case 'clothes':
      return `${base}/api/clothes/${encodeURIComponent(contentId)}/versions/${encodeURIComponent(versionId)}/image?original=1`
    case 'plugins':
      return `${base}/api/plugins/${encodeURIComponent(contentId)}/versions/${encodeURIComponent(versionId)}/download`
    case 'softmods':
      return `${base}/api/softmods/${encodeURIComponent(contentId)}/versions/${encodeURIComponent(versionId)}/download`
  }
}

export async function fetchContentBytes(
  apiUrl: string,
  kind: ContentKind,
  contentId: string,
  versionId: string,
): Promise<Uint8Array> {
  const url = downloadUrlFor(apiUrl, kind, contentId, versionId)
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`)
  }
  return new Uint8Array(await res.arrayBuffer())
}
