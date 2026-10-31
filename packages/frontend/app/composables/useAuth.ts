export interface AuthUser {
  id: string
  discordId: string
  username: string
  avatar: string | null
  createdAt: string
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

  function login() {
    if (import.meta.client) {
      window.location.href = `${apiUrl.value}/api/auth/discord`
    }
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
    loginUrl: computed(() => `${apiUrl.value}/api/auth/discord`),
    refresh,
    login,
    logout,
  }
}
