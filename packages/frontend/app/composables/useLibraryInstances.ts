import type { GameListItem } from '@echbox/shared'
import type { GameInstance } from '~/composables/useLocalInstalls'

export type LibraryEntry = {
  instance: GameInstance
  meta: GameListItem | null
}

/**
 * Shared, app-wide view of the local library: installed game instances joined
 * with catalog metadata. The sidebar, the library routes and the store all read
 * the same state, so an install or uninstall anywhere updates everywhere.
 */
export function useLibraryInstances() {
  const api = useApi()
  const config = useRuntimeConfig()
  const toast = useToast()
  const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
  const { isDesktop, listInstalledInstances, uninstallInstance } = useLocalInstalls()

  const instances = useState<GameInstance[]>('library-instances', () => [])
  const loaded = useState<boolean>('library-instances-loaded', () => false)
  const busyId = useState<string | null>('library-instances-busy', () => null)

  const games = useState<GameListItem[]>('library-games', () => [])
  const gamesLoaded = useState<boolean>('library-games-loaded', () => false)
  const gamesPending = useState<boolean>('library-games-pending', () => false)
  const gamesError = useState<string | null>('library-games-error', () => null)

  const gamesById = computed(() => {
    const map = new Map<string, GameListItem>()
    for (const g of games.value) map.set(g.id, g)
    return map
  })

  const entries = computed<LibraryEntry[]>(() =>
    instances.value.map(instance => ({
      instance,
      meta: gamesById.value.get(instance.gameId) ?? null,
    })),
  )

  async function loadGames(force = false) {
    if (gamesPending.value) return
    if (gamesLoaded.value && !force) return
    gamesPending.value = true
    gamesError.value = null
    try {
      const { data: body, error: err } = await api.api.games.get()
      if (err) throw err
      games.value = (body?.games ?? []) as GameListItem[]
      gamesLoaded.value = true
    }
    catch (err) {
      gamesError.value = err instanceof Error ? err.message : 'Could not load the game catalog'
    }
    finally {
      gamesPending.value = false
    }
  }

  async function refreshInstalled() {
    if (!isDesktop.value) {
      instances.value = []
      loaded.value = true
      return
    }
    try {
      instances.value = await listInstalledInstances()
    }
    finally {
      loaded.value = true
    }
  }

  async function refresh() {
    await Promise.all([loadGames(true), refreshInstalled()])
  }

  /** Uninstall an instance. Returns true on success; failures surface as a toast. */
  async function uninstall(instanceId: string): Promise<boolean> {
    if (!isDesktop.value) return false
    busyId.value = instanceId
    try {
      await uninstallInstance(instanceId)
      await refreshInstalled()
      return true
    }
    catch (err) {
      toast.add({
        title: 'Uninstall failed',
        description: err instanceof Error ? err.message : String(err),
        color: 'error',
        icon: 'i-lucide-circle-alert',
      })
      return false
    }
    finally {
      busyId.value = null
    }
  }

  function instancesForGame(gameId: string): GameInstance[] {
    return instances.value.filter(i => i.gameId === gameId)
  }

  function iconSrc(game: GameListItem, size: '64' | '128' = '64') {
    return `${apiUrl.value}${game.iconUrls[size]}?v=${encodeURIComponent(game.updatedAt)}`
  }

  function entryTitle(entry: LibraryEntry) {
    return entry.instance.label || entry.meta?.title || 'Unknown game'
  }

  function entrySubtitle(entry: LibraryEntry) {
    if (entry.instance.label && entry.meta?.title && entry.instance.label !== entry.meta.title) {
      return entry.meta.title
    }
    return entry.meta?.slug || entry.instance.instanceId.slice(0, 8)
  }

  return {
    isDesktop,
    instances,
    entries,
    loaded,
    busyId,
    games,
    gamesById,
    gamesLoaded,
    gamesPending,
    gamesError,
    loadGames,
    refreshInstalled,
    refresh,
    uninstall,
    instancesForGame,
    iconSrc,
    entryTitle,
    entrySubtitle,
  }
}
