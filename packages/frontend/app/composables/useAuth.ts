import { openUrl } from '@tauri-apps/plugin-opener'

export interface AuthUser {
  id: string
  discordId: string
  username: string
  avatar: string | null
  createdAt: string
}

const AUTH_NONCE_KEY = 'echbox:auth-nonce'

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function useAuth() {
  const api = useApi()
  const config = useRuntimeConfig()
  const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))

  const user = useState<AuthUser | null>('auth:user', () => null)
  const pending = useState<boolean>('auth:pending', () => false)
  const initialized = useState<boolean>('auth:initialized', () => false)

  async function refresh(): Promise<AuthUser | null> {
    pending.value = true
    try {
      const { data, error } = await api.api.auth.me.get({
        fetch: {
          credentials: 'include',
        },
      })
      if (error || !data || 'error' in data) {
        user.value = null
      }
      else {
        user.value = {
          id: data.id,
          discordId: data.discordId,
          username: data.username,
          avatar: data.avatar,
          createdAt: String(data.createdAt),
        }
      }
      return user.value
    }
    catch {
      user.value = null
      return null
    }
    finally {
      pending.value = false
      initialized.value = true
    }
  }

  async function claimSession(token: string): Promise<boolean> {
    const nonce = import.meta.client
      ? localStorage.getItem(AUTH_NONCE_KEY)
      : null
    if (!nonce) {
      return false
    }

    const { data, error } = await api.api.auth.claim.post(
      { token, nonce },
      {
        fetch: {
          credentials: 'include',
        },
      },
    )
    if (error || !data || !('ok' in data) || !data.ok) {
      return false
    }
    localStorage.removeItem(AUTH_NONCE_KEY)
    await refresh()
    return Boolean(user.value)
  }

  async function login() {
    if (!import.meta.client) return

    const nonce = createNonce()
    localStorage.setItem(AUTH_NONCE_KEY, nonce)

    const res = await fetch(
      `${apiUrl.value}/api/auth/discord?desktop=1&nonce=${encodeURIComponent(nonce)}`,
      {
        method: 'GET',
        headers: { accept: 'application/json' },
      },
    )
    if (!res.ok) {
      localStorage.removeItem(AUTH_NONCE_KEY)
      throw new Error(`Discord auth start failed (${res.status})`)
    }
    const body = (await res.json()) as { url?: string }
    if (!body.url) {
      localStorage.removeItem(AUTH_NONCE_KEY)
      throw new Error('Discord auth start returned no url')
    }

    await openUrl(body.url)
  }

  async function logout() {
    try {
      await api.api.auth.logout.post(undefined, {
        fetch: {
          credentials: 'include',
        },
      })
    }
    finally {
      user.value = null
    }
  }

  return {
    user,
    pending,
    initialized,
    isAuthenticated: computed(() => Boolean(user.value)),
    loginUrl: computed(() => `${apiUrl.value}/api/auth/discord?desktop=1`),
    refresh,
    claimSession,
    login,
    logout,
  }
}
