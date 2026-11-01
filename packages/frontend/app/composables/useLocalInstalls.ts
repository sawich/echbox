import { invoke } from '@tauri-apps/api/core'

export type ContentKind = 'cards' | 'plugins' | 'scenes' | 'softmods'

export type ContentInstallRow = {
  id: string
  version: number
  title: string
  contentHash?: string | null
  installedAt: string
}

function isTauriRuntime(): boolean {
  if (!import.meta.client) return false
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useLocalInstalls() {
  const isDesktop = computed(() => isTauriRuntime())

  async function listInstalledGames(): Promise<string[]> {
    if (!isDesktop.value) return []
    return await invoke<string[]>('list_installed_games')
  }

  async function installGame(gameId: string): Promise<void> {
    if (!isDesktop.value) {
      throw new Error('Install is only available in the desktop app')
    }
    await invoke('install_game', { gameId })
  }

  async function uninstallGame(gameId: string): Promise<void> {
    if (!isDesktop.value) {
      throw new Error('Uninstall is only available in the desktop app')
    }
    await invoke('uninstall_game', { gameId })
  }

  async function listInstalledContent(
    gameId: string,
    kind: ContentKind,
  ): Promise<ContentInstallRow[]> {
    if (!isDesktop.value) return []
    return await invoke<ContentInstallRow[]>('list_installed_content', {
      gameId,
      kind,
    })
  }

  async function installContent(
    gameId: string,
    kind: ContentKind,
    row: ContentInstallRow,
  ): Promise<void> {
    if (!isDesktop.value) {
      throw new Error('Install is only available in the desktop app')
    }
    await invoke('install_content', { gameId, kind, row })
  }

  async function uninstallContent(
    gameId: string,
    kind: ContentKind,
    contentId: string,
  ): Promise<void> {
    if (!isDesktop.value) {
      throw new Error('Uninstall is only available in the desktop app')
    }
    await invoke('uninstall_content', { gameId, kind, contentId })
  }

  return {
    isDesktop,
    listInstalledGames,
    installGame,
    uninstallGame,
    listInstalledContent,
    installContent,
    uninstallContent,
  }
}
