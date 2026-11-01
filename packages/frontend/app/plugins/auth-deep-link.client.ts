import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { parseClaimToken } from '~/utils/auth-deeplink'

export default defineNuxtPlugin(async () => {
  const { claimSession } = useAuth()

  async function handleUrls(urls: string[] | null | undefined) {
    if (!urls?.length) return
    for (const url of urls) {
      const token = parseClaimToken(url)
      if (!token) continue
      const ok = await claimSession(token)
      if (ok) {
        try {
          await getCurrentWindow().setFocus()
        }
        catch {
          // Focus is best-effort when not running under Tauri window APIs.
        }
        break
      }
    }
  }

  try {
    await handleUrls(await getCurrent())
    await onOpenUrl((urls) => {
      void handleUrls(urls)
    })
  }
  catch {
    // Outside Tauri (or before plugins load) deep-link APIs are unavailable.
  }
})
