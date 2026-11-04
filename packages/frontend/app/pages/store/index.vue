<script setup lang="ts">
import type { ContentKind, GameContentKind, GameListItem } from '@echbox/shared'
import { useLibraryInstances } from '~/composables/useLibraryInstances'
import type { GameInstance } from '~/composables/useLocalInstalls'

type KindFormRow = { kind: ContentKind, label: string, enabled: boolean, relPath: string }

const KIND_OPTIONS: { kind: ContentKind, label: string }[] = [
  { kind: 'cards', label: 'Character cards' },
  { kind: 'clothes', label: 'Clothes' },
  { kind: 'scenes', label: 'Scenes' },
  { kind: 'plugins', label: 'Plugins' },
  { kind: 'softmods', label: 'Softmods' },
]

function blankKindRows(): KindFormRow[] {
  return KIND_OPTIONS.map(o => ({ ...o, enabled: false, relPath: '' }))
}

function hydrateKindRows(kinds: GameContentKind[]): KindFormRow[] {
  const byKind = new Map(kinds.map(k => [k.kind, k]))
  return KIND_OPTIONS.map(o => {
    const hit = byKind.get(o.kind)
    return {
      ...o,
      enabled: Boolean(hit),
      relPath: hit?.relPath ?? '',
    }
  })
}

function serializeKindRows(rows: KindFormRow[]): GameContentKind[] {
  return rows
    .filter(r => r.enabled)
    .map(r => ({
      kind: r.kind,
      relPath: r.relPath.trim() ? r.relPath.trim() : null,
    }))
}

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { isAdmin } = useAuth()
const { isDesktop } = useLocalInstalls()
const { instances, refreshInstalled } = useLibraryInstances()
const { runGameInstall, isTargetBusy } = useAppTasks()
const { extractFromPath, pickExe, listenDragDrop } = useExeIcon()
const router = useRouter()

const actionError = ref<string | null>(null)

const showInstall = ref(false)
const installGameTarget = ref<GameListItem | null>(null)
const installLabel = ref('')
const installError = ref<string | null>(null)

const installBusy = computed(() =>
  installGameTarget.value ? isTargetBusy(installGameTarget.value.id) : false,
)

const showCreate = ref(false)
const createTitle = ref('')
const createSlug = ref('')
const createDescription = ref('')
const createKinds = ref(blankKindRows())
const createBusy = ref(false)
const createError = ref<string | null>(null)
const createIconFile = ref<File | null>(null)
const createIconPreview = ref<string | null>(null)
const createExePath = ref<string | null>(null)
const createIconBusy = ref(false)
const createDropActive = ref(false)

const showEdit = ref(false)
const editGame = ref<GameListItem | null>(null)
const editTitle = ref('')
const editSlug = ref('')
const editDescription = ref('')
const editKinds = ref(blankKindRows())
const editBusy = ref(false)
const editError = ref<string | null>(null)
const editIconFile = ref<File | null>(null)
const editIconPreview = ref<string | null>(null)
const editExePath = ref<string | null>(null)
const editIconBusy = ref(false)
const editDropActive = ref(false)

const showDelete = ref(false)
const deleteGame = ref<GameListItem | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

const canCreateGame = computed(() => isAdmin.value && isDesktop.value)

const { data, error, status, refresh } = await useAsyncData('store-games', async () => {
  const { data: body, error: err } = await api.api.games.get()
  if (err) throw err
  return (body?.games ?? []) as GameListItem[]
})

const games = computed(() => data.value ?? [])

function revokeUrl(url: Ref<string | null>) {
  if (url.value) {
    URL.revokeObjectURL(url.value)
    url.value = null
  }
}

function resetCreateForm() {
  createTitle.value = ''
  createSlug.value = ''
  createDescription.value = ''
  createKinds.value = blankKindRows()
  createError.value = null
  createExePath.value = null
  createIconFile.value = null
  createIconBusy.value = false
  createDropActive.value = false
  revokeUrl(createIconPreview)
}

function resetEditForm() {
  editGame.value = null
  editTitle.value = ''
  editSlug.value = ''
  editDescription.value = ''
  editKinds.value = blankKindRows()
  editError.value = null
  editExePath.value = null
  editIconFile.value = null
  editIconBusy.value = false
  editDropActive.value = false
  revokeUrl(editIconPreview)
}

async function applyExePath(
  path: string,
  target: 'create' | 'edit',
) {
  const busy = target === 'create' ? createIconBusy : editIconBusy
  const err = target === 'create' ? createError : editError
  const exePath = target === 'create' ? createExePath : editExePath
  const iconFile = target === 'create' ? createIconFile : editIconFile
  const preview = target === 'create' ? createIconPreview : editIconPreview

  busy.value = true
  err.value = null
  try {
    const { file, previewUrl } = await extractFromPath(path)
    revokeUrl(preview)
    exePath.value = path
    iconFile.value = file
    preview.value = previewUrl
  }
  catch (e) {
    exePath.value = null
    iconFile.value = null
    revokeUrl(preview)
    err.value = e instanceof Error ? e.message : 'Failed to extract icon'
  }
  finally {
    busy.value = false
  }
}

async function onBrowseExe(target: 'create' | 'edit') {
  try {
    const path = await pickExe()
    if (path) await applyExePath(path, target)
  }
  catch (e) {
    const err = target === 'create' ? createError : editError
    err.value = e instanceof Error ? e.message : 'Failed to pick file'
  }
}

function bindDropWhileOpen(open: Ref<boolean>, target: 'create' | 'edit') {
  watch(open, (isOpen) => {
    if (!isOpen) {
      if (target === 'create') resetCreateForm()
      else resetEditForm()
      return
    }
    const stop = listenDragDrop((path) => {
      void applyExePath(path, target)
    })
    watch(open, (still) => {
      if (!still) stop()
    }, { once: true })
  })
}

bindDropWhileOpen(showCreate, 'create')
bindDropWhileOpen(showEdit, 'edit')

function openEdit(game: GameListItem) {
  editGame.value = game
  editTitle.value = game.title
  editSlug.value = game.slug
  editDescription.value = game.description ?? ''
  editKinds.value = hydrateKindRows(game.contentKinds ?? [])
  editError.value = null
  editIconFile.value = null
  editExePath.value = null
  revokeUrl(editIconPreview)
  showEdit.value = true
}

function openDelete(game: GameListItem) {
  deleteGame.value = game
  deleteError.value = null
  showDelete.value = true
}

watch(showDelete, (open) => {
  if (!open) {
    deleteGame.value = null
    deleteError.value = null
    deleteBusy.value = false
  }
})

async function confirmDelete() {
  const game = deleteGame.value
  if (!game || deleteBusy.value) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    const { error: err } = await api.api.games({ id: game.id }).delete(
      undefined,
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      deleteError.value = val?.error || `Failed to delete game (${err.status})`
      return
    }
    showDelete.value = false
    await refresh()
  }
  catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete game'
  }
  finally {
    deleteBusy.value = false
  }
}

function instancesForGame(gameId: string): GameInstance[] {
  return instances.value
    .filter(i => i.gameId === gameId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function installCount(gameId: string): number {
  return instancesForGame(gameId).length
}

onMounted(() => {
  void refreshInstalled()
})

function openInstall(game: GameListItem) {
  if (!isDesktop.value) {
    actionError.value = 'Install is only available in the desktop app'
    return
  }
  installGameTarget.value = game
  installLabel.value = game.title
  installError.value = null
  showInstall.value = true
}

function resetInstallForm() {
  installGameTarget.value = null
  installLabel.value = ''
  installError.value = null
}

watch(showInstall, (open) => {
  if (!open) resetInstallForm()
})

async function confirmInstall() {
  const game = installGameTarget.value
  if (!game || installBusy.value) return
  const label = installLabel.value.trim()
  if (!label) {
    installError.value = 'Enter a name for this install'
    return
  }
  installError.value = null
  actionError.value = null
  try {
    const created = await runGameInstall({
      gameId: game.id,
      title: game.title,
      label,
    })
    showInstall.value = false
    await refreshInstalled()
    await router.push(`/library/${created.instanceId}`)
  }
  catch (err) {
    installError.value = err instanceof Error ? err.message : 'Install failed'
  }
}

async function onOpen(game: GameListItem) {
  const first = instancesForGame(game.id)[0]
  if (!first) return
  await router.push(`/library/${first.instanceId}`)
}

async function submitCreate() {
  if (!createTitle.value.trim() || !createIconFile.value || createBusy.value) return
  createBusy.value = true
  createError.value = null
  try {
    const form = new FormData()
    form.set('title', createTitle.value.trim())
    const slug = createSlug.value.trim()
    if (slug) form.set('slug', slug)
    const description = createDescription.value.trim()
    if (description) form.set('description', description)
    form.set('contentKinds', JSON.stringify(serializeKindRows(createKinds.value)))
    form.set('icon', createIconFile.value, 'icon.png')

    const res = await fetch(`${apiUrl.value}/api/games`, {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json' },
      body: form,
    })
    const payload = await res.json().catch(() => null) as { error?: string } | null
    if (!res.ok) {
      createError.value = payload?.error || `Create failed (${res.status})`
      return
    }
    showCreate.value = false
    resetCreateForm()
    await refresh()
  }
  catch (err) {
    createError.value = err instanceof Error ? err.message : 'Create failed'
  }
  finally {
    createBusy.value = false
  }
}

async function submitEdit() {
  if (!editGame.value || !editTitle.value.trim() || editBusy.value) return
  editBusy.value = true
  editError.value = null
  try {
    const form = new FormData()
    form.set('title', editTitle.value.trim())
    form.set('slug', editSlug.value.trim())
    form.set('description', editDescription.value.trim())
    form.set('contentKinds', JSON.stringify(serializeKindRows(editKinds.value)))
    if (editIconFile.value) {
      form.set('icon', editIconFile.value, 'icon.png')
    }

    const res = await fetch(`${apiUrl.value}/api/games/${editGame.value.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { accept: 'application/json' },
      body: form,
    })
    const payload = await res.json().catch(() => null) as { error?: string } | null
    if (!res.ok) {
      editError.value = payload?.error || `Update failed (${res.status})`
      return
    }
    showEdit.value = false
    resetEditForm()
    await refresh()
  }
  catch (err) {
    editError.value = err instanceof Error ? err.message : 'Update failed'
  }
  finally {
    editBusy.value = false
  }
}

function iconSrc(game: GameListItem, size: '64' | '128' = '128') {
  return `${apiUrl.value}${game.iconUrls[size]}?v=${encodeURIComponent(game.updatedAt)}`
}

function pathName(path: string | null) {
  if (!path) return null
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

const createExeName = computed(() => pathName(createExePath.value))
const editExeName = computed(() => pathName(editExePath.value))

const editPreviewSrc = computed(() => {
  if (editIconPreview.value) return editIconPreview.value
  if (editGame.value) return iconSrc(editGame.value)
  return null
})
</script>

<template>
  <main class="ed-page-enter w-full space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <PageHeader
      eyebrow="Store"
      icon="i-lucide-store"
      title="Store"
      description="Browse games and install them into your local library."
      :count="status === 'success' ? games.length : null"
    >
      <template #actions>
        <UModal
          v-if="canCreateGame"
          v-model:open="showCreate"
          title="Add game"
          description="Admin-only. Drop the game EXE to extract its icon, then create a catalog entry."
          :ui="{ content: 'sm:max-w-lg' }"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
          >
            Add game
          </UButton>
          <template #body>
            <form
              id="create-game-form"
              class="grid gap-4"
              @submit.prevent="submitCreate"
            >
              <div
                class="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors"
                :class="createDropActive
                  ? 'border-primary bg-primary/5'
                  : 'border-default bg-elevated/40'"
                @dragenter.prevent="createDropActive = true"
                @dragover.prevent="createDropActive = true"
                @dragleave.prevent="createDropActive = false"
                @drop.prevent="createDropActive = false"
                @click="onBrowseExe('create')"
              >
                <img
                  v-if="createIconPreview"
                  :src="createIconPreview"
                  alt="Extracted icon"
                  class="size-16 rounded-md object-contain"
                >
                <UIcon
                  v-else
                  name="i-lucide-app-window"
                  class="size-8 text-muted"
                />
                <div class="space-y-1">
                  <p class="text-sm font-medium text-highlighted">
                    {{ createIconBusy ? 'Extracting icon…' : (createExeName || 'Drop game EXE here') }}
                  </p>
                  <p class="text-xs text-muted">
                    or click to browse · .exe only · largest icon is uploaded
                  </p>
                </div>
              </div>

              <UFormField
                label="Title"
                required
              >
                <UInput
                  v-model="createTitle"
                  required
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Slug"
                hint="Optional"
              >
                <UInput
                  v-model="createSlug"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Description"
                hint="Optional"
              >
                <UTextarea
                  v-model="createDescription"
                  :rows="3"
                  class="w-full"
                />
              </UFormField>
              <fieldset class="grid gap-3">
                <legend class="text-sm font-medium text-highlighted">
                  Content types
                </legend>
                <p class="text-xs text-muted">
                  Enable kinds this game supports. Paths are relative to the instance root; leave empty for the root.
                </p>
                <div
                  v-for="row in createKinds"
                  :key="row.kind"
                  class="grid gap-2 rounded-lg border border-default px-3 py-2"
                >
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      v-model="row.enabled"
                      type="checkbox"
                      class="size-4 accent-[var(--ui-primary)]"
                    >
                    <span>{{ row.label }}</span>
                  </label>
                  <UInput
                    v-if="row.enabled"
                    v-model="row.relPath"
                    placeholder="Relative path (optional)"
                    class="w-full"
                  />
                </div>
              </fieldset>
              <UAlert
                v-if="createError"
                color="error"
                variant="subtle"
                :title="createError"
              />
            </form>
          </template>
          <template #footer="{ close }">
            <div class="flex w-full justify-end gap-2">
              <UButton
                variant="ghost"
                color="neutral"
                @click="close()"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                form="create-game-form"
                color="primary"
                :loading="createBusy || createIconBusy"
                :disabled="!createTitle.trim() || !createIconFile"
              >
                Create
              </UButton>
            </div>
          </template>
        </UModal>
        <UTooltip
          v-else-if="isAdmin && !isDesktop"
          text="Add game requires the desktop app (EXE icon extraction)"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
            disabled
          >
            Add game
          </UButton>
        </UTooltip>
      </template>
    </PageHeader>

    <UModal
      v-model:open="showInstall"
      title="Install game"
      description="Choose a name for this local install. It appears in your Library."
      :ui="{ content: 'sm:max-w-md' }"
    >
      <span class="hidden" />
      <template #body>
        <form
          id="install-game-form"
          class="grid gap-4"
          @submit.prevent="confirmInstall"
        >
          <UFormField
            label="Install name"
            name="installLabel"
            required
          >
            <UInput
              v-model="installLabel"
              autofocus
              placeholder="My install"
              :disabled="installBusy"
            />
          </UFormField>
          <p
            v-if="installGameTarget"
            class="text-sm text-muted"
          >
            Catalog: {{ installGameTarget.title }}
          </p>
          <UAlert
            v-if="installError"
            color="error"
            variant="subtle"
            :title="installError"
          />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="installBusy"
            @click="showInstall = false"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            form="install-game-form"
            color="primary"
            :loading="installBusy"
            :disabled="!installLabel.trim()"
          >
            Install
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-if="isAdmin"
      v-model:open="showDelete"
      title="Delete game"
      :description="deleteGame
        ? `This removes ${deleteGame.title} from the store, including its cards, clothes, scenes, plugins, and softmods. Local installs stay.`
        : undefined"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <span class="hidden" />
      <template #body>
        <UAlert
          v-if="deleteError"
          color="error"
          variant="subtle"
          :title="deleteError"
        />
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="deleteBusy"
            @click="close()"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            :loading="deleteBusy"
            :disabled="deleteBusy"
            @click="confirmDelete"
          >
            Delete forever
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-if="isAdmin"
      v-model:open="showEdit"
      title="Edit game"
      description="Update catalog metadata. Icon replace is optional and requires the desktop app."
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <span class="hidden" />
      <template #body>
        <form
          id="edit-game-form"
          class="grid gap-4"
          @submit.prevent="submitEdit"
        >
          <div
            class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors"
            :class="[
              isDesktop ? 'cursor-pointer' : 'opacity-80',
              editDropActive
                ? 'border-primary bg-primary/5'
                : 'border-default bg-elevated/40',
            ]"
            @dragenter.prevent="isDesktop && (editDropActive = true)"
            @dragover.prevent="isDesktop && (editDropActive = true)"
            @dragleave.prevent="editDropActive = false"
            @drop.prevent="editDropActive = false"
            @click="isDesktop && onBrowseExe('edit')"
          >
            <img
              v-if="editPreviewSrc"
              :src="editPreviewSrc"
              alt="Game icon"
              class="size-16 rounded-md object-contain"
            >
            <UIcon
              v-else
              name="i-lucide-app-window"
              class="size-8 text-muted"
            />
            <div class="space-y-1">
              <p class="text-sm font-medium text-highlighted">
                {{
                  editIconBusy
                    ? 'Extracting icon…'
                    : (editExeName || (isDesktop ? 'Drop EXE to replace icon' : 'Current icon'))
                }}
              </p>
              <p class="text-xs text-muted">
                {{ isDesktop ? 'optional · .exe only' : 'Icon replace needs the desktop app' }}
              </p>
            </div>
          </div>

          <UFormField
            label="Title"
            required
          >
            <UInput
              v-model="editTitle"
              required
              class="w-full"
            />
          </UFormField>
          <UFormField label="Slug">
            <UInput
              v-model="editSlug"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Description"
            hint="Optional"
          >
            <UTextarea
              v-model="editDescription"
              :rows="3"
              class="w-full"
            />
          </UFormField>
          <fieldset class="grid gap-3">
            <legend class="text-sm font-medium text-highlighted">
              Content types
            </legend>
            <p class="text-xs text-muted">
              Enable kinds this game supports. Paths are relative to the instance root; leave empty for the root.
            </p>
            <div
              v-for="row in editKinds"
              :key="row.kind"
              class="grid gap-2 rounded-lg border border-default px-3 py-2"
            >
              <label class="flex items-center gap-2 text-sm">
                <input
                  v-model="row.enabled"
                  type="checkbox"
                  class="size-4 accent-[var(--ui-primary)]"
                >
                <span>{{ row.label }}</span>
              </label>
              <UInput
                v-if="row.enabled"
                v-model="row.relPath"
                placeholder="Relative path (optional)"
                class="w-full"
              />
            </div>
          </fieldset>
          <UAlert
            v-if="editError"
            color="error"
            variant="subtle"
            :title="editError"
          />
        </form>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            @click="close()"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            form="edit-game-form"
            color="primary"
            :loading="editBusy || editIconBusy"
            :disabled="!editTitle.trim()"
          >
            Save
          </UButton>
        </div>
      </template>
    </UModal>

    <UAlert
      v-if="!isDesktop"
      color="neutral"
      variant="subtle"
      icon="i-lucide-monitor"
      title="Install requires the desktop app"
      description="You can browse the store in the browser; installing games writes ~/.echbox on desktop."
    />

    <UAlert
      v-if="actionError"
      color="error"
      variant="subtle"
      :title="actionError"
    />

    <GallerySkeleton
      v-if="status === 'pending'"
      variant="landscape"
      :count="4"
    />
    <LoadError
      v-else-if="error"
      title="Could not load store"
      :message="error.message"
      @retry="refresh()"
    />
    <UEmpty
      v-else-if="games.length === 0"
      icon="i-lucide-store"
      title="No games yet"
      :description="canCreateGame ? 'Add the first game.' : 'Check back later.'"
      variant="soft"
      class="py-16"
    />
    <div
      v-else
      class="ed-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      <article
        v-for="game in games"
        :key="game.id"
        class="ed-card group relative flex flex-col gap-4 p-4"
      >
        <div class="flex items-start gap-3.5">
          <img
            :src="iconSrc(game)"
            :alt="`${game.title} icon`"
            class="size-14 shrink-0 rounded-[var(--radius-md)] bg-[var(--ed-surface-container-highest)] object-contain ring-1 ring-[var(--ed-outline-variant)]"
            loading="lazy"
          >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-start justify-between gap-2">
              <h2 class="truncate text-[15px] font-semibold text-highlighted">
                {{ game.title }}
              </h2>
              <UBadge
                v-if="installCount(game.id) > 0"
                color="success"
                variant="subtle"
                size="sm"
                icon="i-lucide-check"
                class="shrink-0"
              >
                {{ installCount(game.id) === 1 ? 'Installed' : `${installCount(game.id)} installs` }}
              </UBadge>
            </div>
            <p class="truncate font-mono text-[11px] text-dimmed">
              {{ game.slug }}
            </p>
            <p
              v-if="game.description"
              class="line-clamp-2 text-sm text-pretty text-muted"
            >
              {{ game.description }}
            </p>
          </div>
        </div>
        <div class="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--ed-outline-variant)] pt-3">
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-download"
            :loading="isTargetBusy(game.id)"
            :disabled="!isDesktop"
            @click="openInstall(game)"
          >
            {{ isDesktop ? 'Install' : 'Desktop only' }}
          </UButton>
          <UButton
            v-if="installCount(game.id) > 0"
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-library"
            @click="onOpen(game)"
          >
            Open in Library
          </UButton>
          <div
            v-if="isAdmin"
            class="ml-auto flex items-center gap-0.5"
          >
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-pencil"
              @click="openEdit(game)"
            >
              Edit
            </UButton>
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash-2"
              aria-label="Delete game"
              @click="openDelete(game)"
            />
          </div>
        </div>
      </article>
    </div>
  </main>
</template>
