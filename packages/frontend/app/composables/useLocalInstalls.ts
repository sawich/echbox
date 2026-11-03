import { invoke } from '@tauri-apps/api/core'

export type ContentKind = 'cards' | 'plugins' | 'scenes' | 'clothes' | 'softmods'

export type GameInstance = {
  instanceId: string
  gameId: string
  label: string
  createdAt: string
}

export type ContentInstallRow = {
  id: string
  versionId: string
  semver: string
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

  async function listInstalledInstances(): Promise<GameInstance[]> {
    if (!isDesktop.value) return []
    return await invoke<GameInstance[]>('list_installed_instances')
  }

  async function installGame(gameId: string): Promise<GameInstance> {
    if (!isDesktop.value) {
      throw new Error('Install is only available in the desktop app')
    }
    return await invoke<GameInstance>('install_game', { gameId })
  }

  async function uninstallInstance(instanceId: string): Promise<void> {
    if (!isDesktop.value) {
      throw new Error('Uninstall is only available in the desktop app')
    }
    await invoke('uninstall_instance', { instanceId })
  }

  async function listInstalledContent(
    instanceId: string,
    kind: ContentKind,
  ): Promise<ContentInstallRow[]> {
    if (!isDesktop.value) return []
    return await invoke<ContentInstallRow[]>('list_installed_content', {
      instanceId,
      kind,
    })
  }

  async function installContent(
    instanceId: string,
    kind: ContentKind,
    row: ContentInstallRow,
  ): Promise<void> {
    if (!isDesktop.value) {
      throw new Error('Install is only available in the desktop app')
    }
    await invoke('install_content', { instanceId, kind, row })
  }

  async function uninstallContent(
    instanceId: string,
    kind: ContentKind,
    contentId: string,
  ): Promise<void> {
    if (!isDesktop.value) {
      throw new Error('Uninstall is only available in the desktop app')
    }
    await invoke('uninstall_content', { instanceId, kind, contentId })
  }

  return {
    isDesktop,
    listInstalledInstances,
    installGame,
    uninstallInstance,
    listInstalledContent,
    installContent,
    uninstallContent,
  }
}
