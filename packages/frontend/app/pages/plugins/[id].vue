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

function onVersionFileChange(file: File | null | undefined) {
  versionFile.value = file ?? null
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
  <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
    <UButton
      to="/plugins"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="mb-6 px-0"
    >
      Plugins
    </UButton>

    <DetailSkeleton
      v-if="status === 'pending'"
      media="none"
    />

    <LoadError
      v-else-if="error || !data"
      title="Plugin unavailable"
      :message="error?.message || 'Not found'"
      @retry="refresh()"
    />

    <div
      v-else
      class="space-y-8"
    >
      <header class="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span class="grid size-16 shrink-0 place-items-center rounded-[var(--radius-xl)] bg-gradient-to-br from-[color-mix(in_oklab,var(--ed-secondary)_28%,transparent)] to-[color-mix(in_oklab,var(--ed-secondary)_6%,transparent)] text-secondary shadow-[var(--ed-shadow-card)]">
          <UIcon
            name="i-lucide-puzzle"
            class="size-7"
          />
        </span>
        <div class="min-w-0 flex-1 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
            >
              Plugin
            </UBadge>
            <UBadge
              v-if="data.versionCount > 1"
              color="primary"
              variant="subtle"
              icon="i-lucide-history"
            >
              {{ data.versionCount }} versions
            </UBadge>
            <UBadge
              v-if="isAuthor"
              color="secondary"
              variant="subtle"
              icon="i-lucide-badge-check"
            >
              You're the uploader
            </UBadge>
          </div>
          <h1 class="ed-headline-md text-highlighted">
            {{ data.title }}
          </h1>
          <CopyId :value="data.id" />
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-[1fr_320px] lg:gap-8">
        <div class="min-w-0 space-y-6">
          <SectionCard
            v-if="data.description"
            title="About"
            icon="i-lucide-align-left"
          >
            <p class="text-pretty whitespace-pre-line text-toned">
              {{ data.description }}
            </p>
          </SectionCard>

          <SectionCard
            title="Versions"
            icon="i-lucide-history"
            :description="`${data.versionCount} published`"
          >
            <VersionList
              v-model="selectedVersion"
              :versions="data.versions"
            />
          </SectionCard>

          <SectionCard
            v-if="isAuthor"
            eyebrow="Author controls"
            title="Manage plugin"
            icon="i-lucide-settings-2"
          >
            <div class="space-y-6">
              <form
                class="space-y-3"
                @submit.prevent="saveMetadata"
              >
                <UFormField label="Title">
                  <UInput
                    v-model="editTitle"
                    placeholder="Plugin title"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Description"
                  hint="Optional"
                  :error="metaError ?? undefined"
                  :help="metaSaved && !metaError ? 'Updated.' : undefined"
                >
                  <UTextarea
                    v-model="editDescription"
                    placeholder="What does this plugin do?"
                    :rows="3"
                    autoresize
                    class="w-full"
                  />
                </UFormField>
                <UButton
                  type="submit"
                  color="primary"
                  :loading="savingMeta"
                  :disabled="!editTitle.trim()"
                >
                  Save details
                </UButton>
              </form>

              <USeparator />

              <form
                class="space-y-3"
                @submit.prevent="submitNewVersion"
              >
                <UFormField :label="`Publish v${data.latestVersion + 1}`">
                  <UFileUpload
                    :model-value="versionFile"
                    accept=".zip,application/zip"
                    icon="i-lucide-file-archive"
                    label="Drop the new ZIP here"
                    description="or click to browse"
                    layout="list"
                    class="w-full"
                    @update:model-value="onVersionFileChange"
                  />
                </UFormField>
                <UInput
                  v-model="versionNotes"
                  placeholder="What changed? (optional)"
                  class="w-full"
                />
                <DuplicateNotice
                  v-if="versionDuplicateHit"
                  :to="`/plugins/${versionDuplicateHit.id}`"
                  :label="`plugin ${versionDuplicateHit.id}${versionDuplicateHit.version ? ` (v${versionDuplicateHit.version})` : ''}`"
                  lead="This file already exists as"
                />
                <UAlert
                  v-if="versionError"
                  color="error"
                  variant="subtle"
                  icon="i-lucide-circle-alert"
                  :title="versionError"
                />
                <UButton
                  type="submit"
                  color="primary"
                  variant="soft"
                  icon="i-lucide-upload"
                  :loading="uploadingVersion"
                  :disabled="!versionFile || uploadingVersion"
                >
                  Upload v{{ data.latestVersion + 1 }}
                </UButton>
              </form>

              <DangerZone
                subject="this plugin"
                :busy="deleting"
                :error="deleteError"
                @confirm="handleDelete"
              />
            </div>
          </SectionCard>
        </div>

        <aside class="space-y-4 self-start lg:sticky lg:top-24">
          <div class="ed-card space-y-4 p-5">
            <UButton
              :href="activeDownloadHref"
              external
              download
              color="primary"
              size="lg"
              icon="i-lucide-download"
              block
            >
              Download v{{ active?.version ?? data.latestVersion }}
            </UButton>
            <div class="space-y-2">
              <CardVoteControls
                :likes="data.likes"
                :dislikes="data.dislikes"
                :my-vote="data.myVote"
                :interactive="canVote"
                :busy="voteBusy"
                size="sm"
                @vote="submitVote"
              />
              <p
                v-if="!user"
                class="text-sm text-muted"
              >
                <button
                  type="button"
                  class="font-medium text-primary underline-offset-2 hover:underline"
                  @click="login"
                >
                  Sign in
                </button>
                to like or dislike.
              </p>
              <p
                v-if="voteError"
                class="text-sm text-error"
              >
                {{ voteError }}
              </p>
            </div>
          </div>

          <div class="ed-card space-y-3 p-5">
            <p class="ed-eyebrow text-dimmed">
              Uploaded by
            </p>
            <UUser
              :to="`/u/${data.uploader.id}`"
              :name="data.uploader.username"
              :avatar="{ icon: 'i-lucide-user', alt: data.uploader.username }"
            />
          </div>
        </aside>
      </div>
    </div>
  </main>
</template>
