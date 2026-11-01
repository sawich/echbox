<script setup lang="ts">
import type { CardVoteValue } from '@echbox/shared'

type PluginVersion = {
  version: number
  createdAt: string
  downloadUrl: string
  contentHash: string
  summary: Record<string, unknown>
  notes?: string
}

type PluginDetail = {
  id: string
  authorId: string
  title: string
  description: string | null
  latestVersion: number
  createdAt: string
  updatedAt: string
  uploader: { id: string, username: string }
  downloadUrl: string
  versionCount: number
  versions: PluginVersion[]
  likes: number
  dislikes: number
  myVote: CardVoteValue | null
}

const route = useRoute()
const router = useRouter()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user, login } = useAuth()

const id = computed(() => String(route.params.id))

const { data, error, status, refresh } = await useAsyncData(
  () => `plugin-${id.value}`,
  async () => {
    const { data: plugin, error: err } = await api.api.plugins({ id: id.value }).get({
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    if (!plugin || !('versions' in plugin)) throw new Error('Plugin not found')
    return plugin as PluginDetail
  },
  { watch: [id] },
)

const selectedVersion = ref<number | null>(null)
const editTitle = ref('')
const editDescription = ref('')

watch(
  data,
  (plugin) => {
    if (!plugin) return
    selectedVersion.value = plugin.latestVersion
    editTitle.value = plugin.title
    editDescription.value = plugin.description ?? ''
  },
  { immediate: true },
)

const isAuthor = computed(() =>
  Boolean(user.value && data.value && data.value.authorId === user.value.id),
)

const canVote = computed(() => Boolean(user.value && data.value))

const voteBusy = ref(false)
const voteError = ref<string | null>(null)

async function submitVote(vote: CardVoteValue | null) {
  if (!canVote.value || voteBusy.value || !data.value) return
  if (!user.value) {
    login()
    return
  }

  voteBusy.value = true
  voteError.value = null
  const previous = {
    likes: data.value.likes,
    dislikes: data.value.dislikes,
    myVote: data.value.myVote,
  }

  if (data.value) {
    let likes = previous.likes
    let dislikes = previous.dislikes
    if (previous.myVote === 'like') likes -= 1
    if (previous.myVote === 'dislike') dislikes -= 1
    if (vote === 'like') likes += 1
    if (vote === 'dislike') dislikes += 1
    data.value = { ...data.value, likes, dislikes, myVote: vote }
  }

  try {
    const { data: result, error: err } = await api.api.plugins({ id: id.value }).vote.put(
      { vote },
      { fetch: { credentials: 'include' } },
    )
    if (err || !result || 'error' in result) {
      data.value = { ...data.value!, ...previous }
      const val = err?.value as { error?: string } | undefined
      voteError.value = val?.error || 'Failed to save vote'
      return
    }
    data.value = {
      ...data.value!,
      likes: result.likes,
      dislikes: result.dislikes,
      myVote: result.myVote,
    }
  }
  catch (e) {
    data.value = { ...data.value!, ...previous }
    voteError.value = e instanceof Error ? e.message : 'Failed to save vote'
  }
  finally {
    voteBusy.value = false
  }
}

const active = computed(() => {
  const plugin = data.value
  if (!plugin) return null
  const version = selectedVersion.value ?? plugin.latestVersion
  return plugin.versions.find(v => v.version === version) ?? plugin.versions.at(-1) ?? null
})

const activeDownloadHref = computed(() =>
  active.value ? `${apiUrl.value}${active.value.downloadUrl}` : '',
)

const savingMeta = ref(false)
const metaError = ref<string | null>(null)
const metaSaved = ref(false)

async function saveMetadata() {
  if (!data.value || savingMeta.value) return
  const title = editTitle.value.trim()
  if (!title) return

  savingMeta.value = true
  metaError.value = null
  metaSaved.value = false
  try {
    const body: { title: string, description?: string } = { title }
    const desc = editDescription.value.trim()
    if (desc !== (data.value.description ?? '')) {
      body.description = desc
    }
    const { error: err } = await api.api.plugins({ id: id.value }).patch(
      body,
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      metaError.value = val?.error || `Failed to update (${err.status})`
      return
    }
    metaSaved.value = true
    await refresh()
  }
  catch (e) {
    metaError.value = e instanceof Error ? e.message : 'Failed to update'
  }
  finally {
    savingMeta.value = false
  }
}

const versionFile = ref<File | null>(null)
const versionNotes = ref('')
const uploadingVersion = ref(false)
const versionError = ref<string | null>(null)
const versionDuplicateHit = ref<UploadDuplicateHit | null>(null)

function onVersionFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  versionFile.value = input.files?.[0] ?? null
  versionError.value = null
  versionDuplicateHit.value = null
}

async function submitNewVersion() {
  if (!versionFile.value || uploadingVersion.value) return
  uploadingVersion.value = true
  versionError.value = null
  versionDuplicateHit.value = null

  try {
    const form = new FormData()
    form.append('file', versionFile.value)
    if (versionNotes.value.trim()) {
      form.append('notes', versionNotes.value.trim())
    }

    const res = await fetch(`${apiUrl.value}/api/plugins/${id.value}/versions`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })

    const payload = await res.json().catch(() => null) as Record<string, unknown> | null
    if (!res.ok) {
      if (res.status === 409) {
        const dup = parseUploadDuplicatePayload(payload)
        if (dup) versionDuplicateHit.value = dup
      }
      versionError.value = (payload?.error as string | undefined) || `Failed to upload version (${res.status})`
      return
    }

    versionFile.value = null
    versionNotes.value = ''
    await refresh()
    if (payload?.latestVersion) {
      selectedVersion.value = payload.latestVersion
    }
  }
  catch (e) {
    versionError.value = e instanceof Error ? e.message : 'Failed to upload new version'
  }
  finally {
    uploadingVersion.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

async function handleDelete() {
  if (deleting.value) return
  deleting.value = true
  deleteError.value = null

  try {
    const { error: err } = await api.api.plugins({ id: id.value }).delete(
      undefined,
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      deleteError.value = val?.error || `Failed to delete (${err.status})`
      return
    }
    await router.push('/plugins')
  }
  catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete'
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-5 py-7 sm:px-6 sm:py-8">
    <div class="mb-6">
      <UButton
        to="/plugins"
        variant="ghost"
        color="neutral"
        size="sm"
        icon="i-lucide-arrow-left"
      >
        Plugins
      </UButton>
    </div>

    <div
      v-if="status === 'pending'"
      class="ed-body-md text-[var(--ed-on-surface-variant)]"
    >
      Loading plugin…
    </div>

    <EdSurface
      v-else-if="error || !data"
      :elev="2"
      class="space-y-3 p-6"
    >
      <p class="ed-title-md text-[var(--ed-error)]">
        Plugin unavailable
      </p>
      <p class="ed-body-md text-[var(--ed-on-surface-variant)]">
        {{ error?.message || 'Not found' }}
      </p>
    </EdSurface>

    <div
      v-else
      class="space-y-6"
    >
      <header class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="neutral">
            plugin
          </UBadge>
          <UBadge
            v-if="data.versionCount > 1"
            color="primary"
          >
            {{ data.versionCount }} versions
          </UBadge>
          <UBadge
            v-if="isAuthor"
            color="secondary"
            variant="soft"
          >
            Author
          </UBadge>
        </div>
        <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--ed-on-surface)]">
          {{ data.title }}
        </h1>
        <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
          {{ data.id }}
        </p>
        <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
          Uploader:
          <NuxtLink
            :to="`/u/${data.uploader.id}`"
            class="text-[var(--ed-primary)] underline-offset-2 hover:underline"
          >
            {{ data.uploader.username }}
          </NuxtLink>
        </p>
        <p
          v-if="data.description"
          class="ed-body-md text-[var(--ed-on-surface-variant)]"
        >
          {{ data.description }}
        </p>
        <UButton
          :href="activeDownloadHref"
          external
          download
          color="primary"
          icon="i-lucide-download"
        >
          Download v{{ active?.version ?? data.latestVersion }}
        </UButton>
      </header>

      <section class="space-y-2">
        <h2 class="ed-title-md text-[var(--ed-on-surface)]">
          Rating
        </h2>
        <CardVoteControls
          :likes="data.likes"
          :dislikes="data.dislikes"
          :my-vote="data.myVote"
          :interactive="canVote"
          :busy="voteBusy"
          @vote="submitVote"
        />
        <p
          v-if="!user"
          class="ed-label-md text-[var(--ed-on-surface-variant)]"
        >
          <button
            type="button"
            class="text-[var(--ed-primary)] underline-offset-2 hover:underline"
            @click="login"
          >
            Log in
          </button>
          to like or dislike.
        </p>
        <p
          v-if="voteError"
          class="ed-body-md text-[var(--ed-error)]"
        >
          {{ voteError }}
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="ed-title-md text-[var(--ed-on-surface)]">
          Versions
        </h2>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="ver in data.versions"
            :key="ver.version"
            size="sm"
            :variant="selectedVersion === ver.version ? 'solid' : 'outline'"
            @click="selectedVersion = ver.version"
          >
            v{{ ver.version }}
          </UButton>
        </div>
        <p
          v-if="active?.notes"
          class="ed-body-md text-[var(--ed-on-surface-variant)]"
        >
          {{ active.notes }}
        </p>
        <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
          {{ active?.createdAt }}
        </p>
      </section>

      <EdSurface
        v-if="isAuthor"
        :elev="2"
        class="space-y-6 p-5"
      >
        <div class="space-y-1">
          <EdLabel>Author controls</EdLabel>
          <h2 class="ed-title-md text-[var(--ed-on-surface)]">
            Manage plugin
          </h2>
        </div>

        <form
          class="space-y-3"
          @submit.prevent="saveMetadata"
        >
          <label class="ed-label-md block text-[var(--ed-on-surface-variant)]">
            Title & description
          </label>
          <UInput
            v-model="editTitle"
            placeholder="Plugin title"
          />
          <UTextarea
            v-model="editDescription"
            placeholder="Description (optional)"
            :rows="3"
          />
          <UButton
            type="submit"
            size="sm"
            color="primary"
            :loading="savingMeta"
            :disabled="!editTitle.trim()"
          >
            Save metadata
          </UButton>
          <p
            v-if="metaError"
            class="ed-body-md text-[var(--ed-error)]"
          >
            {{ metaError }}
          </p>
          <p
            v-else-if="metaSaved"
            class="ed-label-md text-[var(--ed-secondary)]"
          >
            Updated.
          </p>
        </form>

        <form
          class="space-y-3 border-t border-[var(--ed-outline-variant)] pt-4"
          @submit.prevent="submitNewVersion"
        >
          <label class="ed-label-md block text-[var(--ed-on-surface-variant)]">
            Upload new version (ZIP)
          </label>
          <input
            type="file"
            accept=".zip,application/zip"
            required
            class="block w-full rounded-[var(--radius-md)] border border-[var(--ed-outline-variant)] bg-[var(--ed-surface-container)] px-3 py-2 text-sm text-[var(--ed-on-surface)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--ed-primary-container)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--ed-on-primary-container)]"
            @change="onVersionFileChange"
          >
          <UInput
            v-model="versionNotes"
            placeholder="Version notes (optional)"
          />
          <div
            v-if="versionDuplicateHit"
            class="rounded-[var(--radius-md)] border border-[var(--ed-secondary)] bg-[color-mix(in_oklab,var(--ed-secondary-container)_40%,transparent)] p-3 text-sm text-[var(--ed-on-secondary-container)]"
          >
            This file already exists as
            <NuxtLink
              :to="`/plugins/${versionDuplicateHit.id}`"
              class="font-semibold underline"
            >
              plugin {{ versionDuplicateHit.id }}<template v-if="versionDuplicateHit.version"> (v{{ versionDuplicateHit.version }})</template>
            </NuxtLink>.
          </div>
          <p
            v-if="versionError"
            class="ed-body-md text-[var(--ed-error)]"
          >
            {{ versionError }}
          </p>
          <UButton
            type="submit"
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide-upload"
            :loading="uploadingVersion"
            :disabled="!versionFile || uploadingVersion"
          >
            Upload v{{ data.latestVersion + 1 }}
          </UButton>
        </form>

        <div class="space-y-2 border-t border-[var(--ed-outline-variant)] pt-4">
          <div
            v-if="!confirmingDelete"
            class="flex items-center justify-between gap-4"
          >
            <span class="ed-label-md text-[var(--ed-on-surface-variant)]">
              Delete this plugin and all versions permanently
            </span>
            <UButton
              size="sm"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              @click="confirmingDelete = true"
            >
              Delete
            </UButton>
          </div>
          <div
            v-else
            class="flex flex-wrap items-center gap-3"
          >
            <span class="ed-label-md text-[var(--ed-error)]">
              Confirm permanent deletion?
            </span>
            <UButton
              size="sm"
              color="error"
              variant="solid"
              :loading="deleting"
              @click="handleDelete"
            >
              Confirm delete
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              @click="confirmingDelete = false"
            >
              Cancel
            </UButton>
          </div>
          <p
            v-if="deleteError"
            class="ed-body-md text-[var(--ed-error)]"
          >
            {{ deleteError }}
          </p>
        </div>
      </EdSurface>
    </div>
  </main>
</template>
