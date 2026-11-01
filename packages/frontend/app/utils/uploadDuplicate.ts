export type UploadDuplicateHit = {
  id: string
  version?: number
}

export function parseUploadDuplicatePayload(
  payload: Record<string, unknown> | null,
): UploadDuplicateHit | null {
  if (!payload) return null
  const id =
    (payload.pluginId as string | undefined)
    ?? (payload.plugin_id as string | undefined)
    ?? (payload.softmodId as string | undefined)
    ?? (payload.softmod_id as string | undefined)
    ?? (payload.sceneId as string | undefined)
    ?? (payload.scene_id as string | undefined)
  if (!id) return null
  const version = payload.version as number | undefined
  return { id, version }
}
