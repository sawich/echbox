import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'

function isTauriRuntime(): boolean {
  if (!import.meta.client) return false
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function bytesToPngFile(bytes: Uint8Array, name = 'icon.png'): File {
  const copy = new Uint8Array(bytes)
  return new File([copy], name, { type: 'image/png' })
}

export function useExeIcon() {
  const isDesktop = computed(() => isTauriRuntime())

  async function extractFromPath(path: string): Promise<{
    file: File
    previewUrl: string
  }> {
    if (!isDesktop.value) {
      throw new Error('EXE icon extraction requires the desktop app')
    }
    const bytes = await invoke<number[] | Uint8Array>('extract_exe_icon', { path })
    const png = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
    const file = bytesToPngFile(png)
    const previewUrl = URL.createObjectURL(file)
    return { file, previewUrl }
  }

  async function pickExe(): Promise<string | null> {
    if (!isDesktop.value) {
      throw new Error('EXE picker requires the desktop app')
    }
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Executable', extensions: ['exe'] }],
    })
    if (selected == null) return null
    return Array.isArray(selected) ? (selected[0] ?? null) : selected
  }

  function listenDragDrop(onPath: (path: string) => void): () => void {
    if (!isDesktop.value) return () => {}
    let unlisten: (() => void) | undefined
    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return
        const paths = event.payload.paths ?? []
        const exe = paths.find(p => p.toLowerCase().endsWith('.exe'))
        if (exe) onPath(exe)
      })
      .then((fn) => {
        unlisten = fn
      })
    return () => {
      unlisten?.()
    }
  }

  return {
    isDesktop,
    extractFromPath,
    pickExe,
    listenDragDrop,
  }
}
