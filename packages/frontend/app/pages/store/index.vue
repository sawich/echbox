<script setup lang="ts">
import type { GameListItem } from '@echbox/shared'

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { isAdmin } = useAuth()
const { isDesktop, listInstalledGames, installGame } = useLocalInstalls()
const { extractFromPath, pickExe, listenDragDrop } = useExeIcon()
const router = useRouter()

const installed = ref<Set<string>>(new Set())
const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)

const showCreate = ref(false)
const createTitle = ref('')
const createSlug = ref('')
const createDescription = ref('')
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
const editBusy = ref(false)
const editError = ref<string | null>(null)
const editIconFile = ref<File | null>(null)
const editIconPreview = ref<string | null>(null)
const editExePath = ref<string | null>(null)
const editIconBusy = ref(false)
const editDropActive = ref(false)

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
  editError.value = null
  editIconFile.value = null
  editExePath.value = null
  revokeUrl(editIconPreview)
  showEdit.value = true
}

async function refreshInstalled() {
  if (!isDesktop.value) {
    installed.value = new Set()
    return
  }
  installed.value = new Set(await listInstalledGames())
}

onMounted(() => {
  void refreshInstalled()
})

async function onInstall(game: GameListItem) {
  if (!isDesktop.value) {
    actionError.value = 'Install is only available in the desktop app'
    return
  }
  busyId.value = game.id
  actionError.value = null
  try {
    await installGame(game.id)
    await refreshInstalled()
  }
  catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Install failed'
  }
  finally {
    busyId.value = null
  }
}

async function onOpen(game: GameListItem) {
  await router.push(`/library/${game.id}`)
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
  <main class="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
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
            size="lg"
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
            size="lg"
            disabled
          >
            Add game
          </UButton>
        </UTooltip>
      </template>
    </PageHeader>

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
      class="ed-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <article
        v-for="game in games"
        :key="game.id"
        class="ed-card flex flex-col gap-4 p-5"
      >
        <div class="flex gap-4">
          <img
            :src="iconSrc(game)"
            :alt="`${game.title} icon`"
            class="size-16 shrink-0 rounded-md bg-elevated object-contain"
            loading="lazy"
          >
          <div class="min-w-0 space-y-1">
            <h2 class="text-lg font-semibold text-highlighted">
              {{ game.title }}
            </h2>
            <p class="text-xs font-mono text-dimmed">
              {{ game.slug }}
            </p>
            <p
              v-if="game.description"
              class="text-sm text-muted"
            >
              {{ game.description }}
            </p>
          </div>
        </div>
        <div class="mt-auto flex flex-wrap gap-2">
          <UButton
            v-if="installed.has(game.id)"
            color="primary"
            @click="onOpen(game)"
          >
            Open in Library
          </UButton>
          <UButton
            v-else
            color="primary"
            :loading="busyId === game.id"
            :disabled="!isDesktop"
            @click="onInstall(game)"
          >
            {{ isDesktop ? 'Install' : 'Desktop only' }}
          </UButton>
          <UButton
            v-if="isAdmin"
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            @click="openEdit(game)"
          >
            Edit
          </UButton>
        </div>
      </article>
    </div>
  </main>
</template>
