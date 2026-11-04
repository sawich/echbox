import type { ContentInstallRow, ContentKind, GameInstance } from './useLocalInstalls'
import { fetchContentBytes } from '~/utils/contentInstall'

export type AppTaskKind = 'content-install' | 'content-uninstall' | 'game-install'
export type AppTaskStatus = 'running' | 'succeeded' | 'failed'

export type AppTask = {
  id: string
  kind: AppTaskKind
  /** Content id or game id — used for busy checks */
  targetId: string
  title: string
  subtitle?: string | null
  status: AppTaskStatus
  error?: string | null
  createdAt: string
  updatedAt: string
}

type TaskMeta = {
  kind: AppTaskKind
  targetId: string
  title: string
  subtitle?: string | null
}

const TOAST_ROTATE_MS = 3000

let rotateTimer: ReturnType<typeof setInterval> | null = null

function nowIso() {
  return new Date().toISOString()
}

function newTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useAppTasks() {
  const tasks = useState<AppTask[]>('app-tasks', () => [])
  const toastIndex = useState<number>('app-tasks-toast-index', () => 0)

  const runningTasks = computed(() =>
    tasks.value.filter(t => t.status === 'running'),
  )

  const activeToastTask = computed(() => {
    const running = runningTasks.value
    if (running.length === 0) return null
    return running[toastIndex.value % running.length] ?? running[0] ?? null
  })

  function ensureRotateTimer() {
    if (!import.meta.client) return
    if (rotateTimer != null) return
    rotateTimer = setInterval(() => {
      const n = runningTasks.value.length
      if (n === 0) {
        toastIndex.value = 0
        return
      }
      toastIndex.value = (toastIndex.value + 1) % n
    }, TOAST_ROTATE_MS)
  }

  function patchTask(id: string, patch: Partial<AppTask>) {
    tasks.value = tasks.value.map(t =>
      t.id === id ? { ...t, ...patch, updatedAt: nowIso() } : t,
    )
  }

  async function runTask<T>(meta: TaskMeta, work: () => Promise<T>): Promise<T> {
    const id = newTaskId()
    const createdAt = nowIso()
    const task: AppTask = {
      id,
      kind: meta.kind,
      targetId: meta.targetId,
      title: meta.title,
      subtitle: meta.subtitle ?? null,
      status: 'running',
      error: null,
      createdAt,
      updatedAt: createdAt,
    }
    tasks.value = [task, ...tasks.value]
    ensureRotateTimer()

    try {
      const result = await work()
      patchTask(id, { status: 'succeeded', error: null })
      return result
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Task failed'
      patchTask(id, { status: 'failed', error: message })
      throw err
    }
  }

  function isTargetBusy(targetId: string): boolean {
    return tasks.value.some(t => t.status === 'running' && t.targetId === targetId)
  }

  function clearCompleted() {
    tasks.value = tasks.value.filter(t => t.status === 'running')
  }

  const {
    installContent,
    uninstallContent,
    installGame,
  } = useLocalInstalls()

  async function runContentInstall(opts: {
    instanceId: string
    kind: ContentKind
    row: ContentInstallRow
    apiUrl: string
    relPath?: string | null
  }): Promise<void> {
    const { instanceId, kind, row, apiUrl, relPath } = opts
    await runTask(
      {
        kind: 'content-install',
        targetId: row.id,
        title: row.title,
        subtitle: `Install ${kind}`,
      },
      async () => {
        const bytes = await fetchContentBytes(apiUrl, kind, row.id, row.versionId)
        await installContent(instanceId, kind, row, { bytes, relPath })
      },
    )
  }

  async function runContentUninstall(opts: {
    instanceId: string
    kind: ContentKind
    contentId: string
    title: string
  }): Promise<void> {
    const { instanceId, kind, contentId, title } = opts
    await runTask(
      {
        kind: 'content-uninstall',
        targetId: contentId,
        title,
        subtitle: `Uninstall ${kind}`,
      },
      async () => {
        await uninstallContent(instanceId, kind, contentId)
      },
    )
  }

  async function runGameInstall(opts: {
    gameId: string
    title: string
    label: string
  }): Promise<GameInstance> {
    const { gameId, title, label } = opts
    return await runTask(
      {
        kind: 'game-install',
        targetId: gameId,
        title,
        subtitle: label !== title ? `Install as “${label}”` : 'Install game',
      },
      async () => installGame(gameId, label),
    )
  }

  if (import.meta.client) {
    ensureRotateTimer()
  }

  return {
    tasks,
    runningTasks,
    activeToastTask,
    runTask,
    runContentInstall,
    runContentUninstall,
    runGameInstall,
    isTargetBusy,
    clearCompleted,
  }
}
