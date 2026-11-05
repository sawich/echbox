<script setup lang="ts">
import type { CardDetail, CardVoteValue, GameListItem } from '@echbox/shared'
import { contentLabel } from '~/utils/content-label'
import { galleryAspect } from '~/utils/gallery'

type CardDetailWithVotes = CardDetail & {
  uploaderId?: string
  authorUsername?: string | null
  authorAvatar?: string | null
  likes?: number
  dislikes?: number
  myVote?: CardVoteValue | null
}

const route = useRoute()
const router = useRouter()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user, isAdmin, login } = useAuth()
const {
  isDesktop,
  listInstalledInstances,
  listInstalledContent,
} = useLocalInstalls()
const {
  runContentInstall,
  runContentUninstall,
  isTargetBusy,
} = useAppTasks()

const id = computed(() => String(route.params.id))

const { data, error, status, refresh } = await useAsyncData(
  () => `card-${id.value}`,
  async () => {
    const { data: card, error: err } = await api.api.kk.cards({ id: id.value }).get({
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    if (!card || !('versions' in card)) throw new Error('Card not found')
    return card as CardDetailWithVotes
  },
  { watch: [id] },
)

const selectedVersion = ref<string | null>(null)
const editDescription = ref('')

watch(
  data,
  (card) => {
    if (!card) return
    selectedVersion.value = card.latestVersionId
    editDescription.value = card.description
  },
  { immediate: true },
)

const libraryInstanceId = ref<string | null>(null)
const contentRelPath = ref<string | null>(null)
const isInstalled = ref(false)
const installError = ref<string | null>(null)

const installBusy = computed(() => isTargetBusy(id.value))

watch(
  () => data.value?.gameId,
  async (gameId) => {
    libraryInstanceId.value = null
    contentRelPath.value = null
    isInstalled.value = false
    if (!gameId || !isDesktop.value) return
    const instances = await listInstalledInstances()
    const match = instances
      .filter(i => i.gameId === gameId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    libraryInstanceId.value = match?.instanceId ?? null

    try {
      const { data: game } = await api.api.games({ id: gameId }).get()
      if (game && !('error' in game)) {
        const path = (game as GameListItem).contentKinds
          ?.find(k => k.kind === 'cards')
          ?.relPath
          ?.trim()
        contentRelPath.value = path || null
      }
    }
    catch {
      contentRelPath.value = null
    }
  },
  { immediate: true },
)

async function refreshInstalled() {
  const instanceId = libraryInstanceId.value
  if (!instanceId || !isDesktop.value) {
    isInstalled.value = false
    return
  }
  const rows = await listInstalledContent(instanceId, 'cards')
  isInstalled.value = rows.some(r => r.id === id.value)
}

watch(libraryInstanceId, () => {
  void refreshInstalled()
})
watch(id, () => {
  void refreshInstalled()
})

const isUploader = computed(() => {
  const card = data.value
  if (!card || !user.value || !card.uploaderId) return false
  return card.uploaderId === user.value.id
})

const canEditMeta = computed(() => isUploader.value || isAdmin.value)

const canVote = computed(
  () => Boolean(user.value) && data.value?.type === 'character',
)

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
    likes: data.value.likes ?? 0,
    dislikes: data.value.dislikes ?? 0,
    myVote: data.value.myVote ?? null,
  }

  // Optimistic local update
  if (data.value) {
    let likes = previous.likes
    let dislikes = previous.dislikes
    if (previous.myVote === 'like') likes -= 1
    if (previous.myVote === 'dislike') dislikes -= 1
    if (vote === 'like') likes += 1
    if (vote === 'dislike') dislikes += 1
    data.value = {
      ...data.value,
      likes,
      dislikes,
      myVote: vote,
    }
  }

  try {
    const { data: result, error: err } = await api.api.kk
      .cards({ id: id.value })
      .vote.put(
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
  const card = data.value
  if (!card) return null
  const versionId = selectedVersion.value ?? card.latestVersionId
  return card.versions.find(v => v.id === versionId) ?? card.versions.at(-1) ?? null
})

const installLabel = computed(() => {
  if (isInstalled.value) return 'Uninstall'
  if (!isDesktop.value) return 'Desktop only'
  return 'Install'
})

const installDisabled = computed(() => {
  if (installBusy.value) return true
  if (isInstalled.value) return false
  if (!isDesktop.value) return true
  if (!libraryInstanceId.value) return true
  return !active.value
})

const installHelp = computed(() => {
  if (!isDesktop.value) return null
  if (!libraryInstanceId.value) return 'Install this game in Library first'
  return null
})

async function toggleInstall() {
  const card = data.value
  const version = active.value
  const instanceId = libraryInstanceId.value
  if (!card || installBusy.value) return

  if (!isDesktop.value) {
    installError.value = 'Install is only available in the desktop app'
    return
  }
  if (!instanceId) {
    installError.value = 'Install this game in Library first'
    return
  }
  if (!isInstalled.value && !version) {
    installError.value = 'This card has no versions to install'
    return
  }

  installError.value = null
  try {
    if (isInstalled.value) {
      await runContentUninstall({
        instanceId,
        kind: 'cards',
        contentId: card.id,
        title: contentLabel(card.description, card.id),
      })
    }
    else {
      await runContentInstall({
        instanceId,
        kind: 'cards',
        row: {
          id: card.id,
          versionId: version!.id,
          semver: version!.semver,
          title: contentLabel(card.description, card.id),
          contentHash: null,
          installedAt: new Date().toISOString(),
        },
        apiUrl: apiUrl.value,
        relPath: contentRelPath.value,
      })
    }
    await refreshInstalled()
  }
  catch (err) {
    installError.value = err instanceof Error ? err.message : 'Install failed'
  }
}

const imageSrc = computed(() => {
  if (!active.value) return ''
  return `${apiUrl.value}${active.value.imageUrl}`
})

const previewAspect = computed(() =>
  data.value ? galleryAspect(data.value.type) : galleryAspect('character'),
)

const savingDescription = ref(false)
const descriptionError = ref<string | null>(null)
const descriptionSaved = ref(false)

async function saveDescription() {
  if (!data.value || savingDescription.value) return
  savingDescription.value = true
  descriptionError.value = null
  descriptionSaved.value = false
  try {
    const { error: err } = await api.api.kk.cards({ id: id.value }).patch(
      { description: editDescription.value.trim() },
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      descriptionError.value = val?.error || `Failed to update description (${err.status})`
      return
    }
    descriptionSaved.value = true
    await refresh()
  }
  catch (e) {
    descriptionError.value = e instanceof Error ? e.message : 'Failed to update description'
  }
  finally {
    savingDescription.value = false
  }
}

// Author state: upload new version
const showVersionUpload = ref(false)
const versionFile = ref<File | null>(null)
const versionNotes = ref('')
const semver = useSemverInput()
const uploadingVersion = ref(false)
const versionError = ref<string | null>(null)
const deletingVersionId = ref<string | null>(null)

function resetVersionUploadForm() {
  versionFile.value = null
  versionNotes.value = ''
  semver.reset()
  versionError.value = null
}

watch(showVersionUpload, (open) => {
  if (!open) resetVersionUploadForm()
})

function onVersionFileChange(file: File | null | undefined) {
  versionFile.value = file ?? null
  versionError.value = null
}

async function handleDeleteVersion(versionId: string) {
  if (deletingVersionId.value) return
  deletingVersionId.value = versionId
  versionError.value = null
  try {
    const res = await fetch(
      `${apiUrl.value}/api/kk/cards/${id.value}/versions/${versionId}`,
      { method: 'DELETE', credentials: 'include' },
    )
    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      versionError.value = payload?.error || `Failed to delete version (${res.status})`
      return
    }
    await refresh()
    selectedVersion.value = payload?.latestVersionId ?? null
  }
  catch (e) {
    versionError.value = e instanceof Error ? e.message : 'Failed to delete version'
  }
  finally {
    deletingVersionId.value = null
  }
}

async function submitNewVersion() {
  semver.markTried()
  if (!semver.valid.value) return

  if (!versionFile.value || uploadingVersion.value || !semver.canonical.value) return
  uploadingVersion.value = true
  versionError.value = null

  try {
    const form = new FormData()
    form.append('file', versionFile.value)
    form.append('semver', semver.canonical.value)
    if (versionNotes.value.trim()) {
      form.append('notes', versionNotes.value.trim())
    }

    const res = await fetch(`${apiUrl.value}/api/kk/cards/${id.value}/versions`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      versionError.value = payload?.error || `Failed to upload version (${res.status})`
      return
    }

    showVersionUpload.value = false
    await refresh()
    if (payload?.latestVersionId) {
      selectedVersion.value = payload.latestVersionId
    }
  }
  catch (e) {
    versionError.value = e instanceof Error ? e.message : 'Failed to upload new version'
  }
  finally {
    uploadingVersion.value = false
  }
}

// Author state: delete card
const deletingCard = ref(false)
const deleteError = ref<string | null>(null)

async function handleDeleteCard() {
  if (deletingCard.value) return
  deletingCard.value = true
  deleteError.value = null

  try {
    const { error: err } = await api.api.kk.cards({ id: id.value }).delete(
      undefined,
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      deleteError.value = val?.error || `Failed to delete card (${err.status})`
      return
    }
    await router.push('/')
  }
  catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete card'
  }
  finally {
    deletingCard.value = false
  }
}
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-7">
    <UButton
      to="/"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="mb-6 px-0"
    >
      Characters
    </UButton>

    <DetailSkeleton
      v-if="status === 'pending'"
      :media="previewAspect === 'aspect-[320/180]' ? 'landscape' : 'portrait'"
    />

    <LoadError
      v-else-if="error || !data"
      title="Card unavailable"
      :message="error?.message || 'Not found'"
      @retry="refresh()"
    />

    <div
      v-else
      class="grid gap-8 lg:gap-12"
      :class="data.type === 'scene'
        ? 'lg:grid-cols-[minmax(0,480px)_1fr]'
        : 'lg:grid-cols-[minmax(0,320px)_1fr]'"
    >
      <aside class="self-start lg:sticky lg:top-6">
        <div class="relative">
          <img
            v-if="imageSrc"
            :src="imageSrc"
            alt=""
            aria-hidden="true"
            class="absolute inset-0 size-full scale-95 rounded-[var(--radius-xl)] object-cover opacity-60 blur-3xl saturate-150"
          >
          <div class="relative overflow-hidden rounded-[var(--radius-xl)] border border-default bg-[var(--ed-surface-container-highest)] shadow-[var(--ed-shadow-lift)]">
            <img
              v-if="imageSrc"
              :key="imageSrc"
              :src="imageSrc"
              alt=""
              class="ed-page-enter w-full object-cover"
              :class="previewAspect"
            >
            <div
              v-else
              class="ed-page-enter grid w-full place-items-center text-dimmed"
              :class="previewAspect"
            >
              <div class="space-y-2 text-center">
                <UIcon
                  name="i-lucide-image-off"
                  class="mx-auto size-10 opacity-40"
                />
                <p class="text-sm text-muted">
                  No version preview
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div class="min-w-0 space-y-6">
        <header class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
              class="capitalize"
            >
              {{ data.type }}
            </UBadge>
            <UBadge
              v-if="data.versions.length > 1"
              color="primary"
              variant="subtle"
              icon="i-lucide-history"
            >
              {{ data.versions.length }} versions
            </UBadge>
            <UBadge
              v-if="isUploader"
              color="secondary"
              variant="subtle"
              icon="i-lucide-badge-check"
            >
              You're the uploader
            </UBadge>
          </div>

          <h1 class="sr-only">
            Character card
          </h1>

          <p
            v-if="data.description && !canEditMeta"
            class="text-pretty whitespace-pre-line text-toned"
          >
            {{ data.description }}
          </p>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <UUser
              v-if="data.uploaderId"
              :to="`/u/${data.uploaderId}`"
              :name="data.authorUsername || 'View profile'"
              description="Uploader"
              :avatar="{ src: data.authorAvatar ?? undefined, alt: data.authorUsername || 'uploader', icon: 'i-lucide-user' }"
              size="md"
            />
            <CopyId :value="data.id" />
          </div>

          <div class="space-y-2 border-t border-default pt-4">
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <UButton
                :color="isInstalled ? 'neutral' : 'primary'"
                :variant="isInstalled ? 'outline' : 'solid'"
                :icon="isInstalled ? 'i-lucide-folder-minus' : 'i-lucide-download'"
                :loading="installBusy"
                :disabled="installDisabled"
                @click="toggleInstall"
              >
                {{ installLabel }}
              </UButton>
              <CardVoteControls
                v-if="data.type === 'character'"
                :likes="data.likes ?? 0"
                :dislikes="data.dislikes ?? 0"
                :my-vote="data.myVote ?? null"
                :interactive="canVote"
                :busy="voteBusy"
                @vote="submitVote"
              />
            </div>
            <p
              v-if="installHelp"
              class="text-sm text-muted"
            >
              {{ installHelp }}
            </p>
            <p
              v-if="data.type === 'character' && !user"
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
            <UAlert
              v-if="installError"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="installError"
            />
          </div>
        </header>

        <SectionCard
          title="Versions"
          icon="i-lucide-history"
          :description="`${data.versions.length} published`"
        >
          <VersionList
            v-model="selectedVersion"
            :versions="data.versions"
            :latest-version-id="data.latestVersionId"
            :deletable="isUploader"
            :deleting-id="deletingVersionId"
            @delete="handleDeleteVersion"
          />
          <UAlert
            v-if="isUploader && versionError"
            class="mt-3"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="versionError"
          />
        </SectionCard>

        <SectionCard
          title="Tags"
          icon="i-lucide-tags"
        >
          <ContentTagEditor
            kind="cards"
            :content-id="data.id"
            :readonly="!canEditMeta"
          />
        </SectionCard>

        <SectionCard
          v-if="canEditMeta"
          eyebrow="Uploader controls"
          title="Manage character card"
          icon="i-lucide-settings-2"
        >
          <div class="space-y-6">
            <form
              class="space-y-2"
              @submit.prevent="saveDescription"
            >
              <UFormField
                label="Description"
                :error="descriptionError ?? undefined"
                :help="descriptionSaved && !descriptionError ? 'Description updated.' : undefined"
              >
                <UTextarea
                  v-model="editDescription"
                  placeholder="What is this card?"
                  :rows="3"
                  autoresize
                  class="w-full"
                />
                <UButton
                  type="submit"
                  color="primary"
                  class="mt-2"
                  :loading="savingDescription"
                  :disabled="editDescription.trim() === data.description"
                >
                  Save description
                </UButton>
              </UFormField>
            </form>

            <template v-if="isUploader">
            <USeparator />

            <UModal
              v-model:open="showVersionUpload"
              title="Publish new version"
              description="Drop a new character PNG to publish another version of this card."
              :ui="{ content: 'sm:max-w-lg' }"
            >
              <UButton
                color="primary"
                variant="soft"
                icon="i-lucide-upload"
              >
                Publish new version
              </UButton>

              <template #body>
                <form
                  id="card-version-upload-form"
                  class="grid gap-5"
                  @submit.prevent="submitNewVersion"
                >
                  <UFileUpload
                    :model-value="versionFile"
                    accept="image/png"
                    icon="i-lucide-image-up"
                    label="Drop the new PNG here"
                    description="or click to browse · PNG only"
                    layout="list"
                    class="min-h-40"
                    @update:model-value="onVersionFileChange"
                  />
                  <UFormField
                    label="Version"
                    required
                    :error="semver.fieldError.value"
                    help="Semantic version, e.g. 1.0.0"
                  >
                    <UInput
                      v-model="semver.raw.value"
                      placeholder="1.0.0"
                      @blur="semver.markTried()"
                      class="w-full font-mono"
                    />
                  </UFormField>
                  <UFormField
                    label="Version notes"
                    hint="Optional"
                  >
                    <UInput
                      v-model="versionNotes"
                      placeholder="What changed?"
                      class="w-full"
                    />
                  </UFormField>
                  <UAlert
                    v-if="versionError"
                    color="error"
                    variant="subtle"
                    icon="i-lucide-circle-alert"
                    :title="versionError"
                  />
                </form>
              </template>

              <template #footer="{ close }">
                <div class="flex w-full justify-end gap-2">
                  <UButton
                    type="button"
                    variant="ghost"
                    color="neutral"
                    @click="close()"
                  >
                    Cancel
                  </UButton>
                  <UButton
                    type="submit"
                    form="card-version-upload-form"
                    color="primary"
                    icon="i-lucide-check"
                    :loading="uploadingVersion"
                    :disabled="!versionFile || uploadingVersion"
                  >
                    Publish version
                  </UButton>
                </div>
              </template>
            </UModal>

            <DangerZone
              subject="this character card"
              :busy="deletingCard"
              :error="deleteError"
              @confirm="handleDeleteCard"
            />
            </template>
          </div>
        </SectionCard>

        <JsonPanel
          v-if="active"
          :title="`Card data · v${active.semver}`"
          :value="active.summary ?? {}"
        />
      </div>
    </div>
  </main>
</template>
