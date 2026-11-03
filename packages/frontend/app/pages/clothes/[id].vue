<script setup lang="ts">
import type { CardVoteValue, ClothesDetail } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

const route = useRoute()
const router = useRouter()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user, login } = useAuth()

const id = computed(() => String(route.params.id))

const { data, error, status, refresh } = await useAsyncData(
  () => `clothes-${id.value}`,
  async () => {
    const { data: item, error: err } = await api.api.clothes({ id: id.value }).get({
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    if (!item || !('versions' in item)) throw new Error('Clothes not found')
    return item as ClothesDetail
  },
  { watch: [id] },
)

const selectedVersion = ref<string | null>(null)
const editTitle = ref('')

watch(
  data,
  (item) => {
    if (!item) return
    selectedVersion.value = item.latestVersionId
    editTitle.value = item.title
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
    const { data: result, error: err } = await api.api.clothes({ id: id.value }).vote.put(
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
  const item = data.value
  if (!item) return null
  const versionId = selectedVersion.value ?? item.latestVersionId
  return item.versions.find(v => v.id === versionId) ?? item.versions.at(-1) ?? null
})

const imageSrc = computed(() => {
  if (!active.value) return ''
  return `${apiUrl.value}${active.value.imageUrl}`
})

const originalDownloadHref = computed(() => {
  if (!active.value) return ''
  return `${apiUrl.value}${active.value.imageUrl}?original=1`
})

const previewAspect = computed(() => galleryAspect('clothes'))

const savingTitle = ref(false)
const titleError = ref<string | null>(null)
const titleSaved = ref(false)

async function saveTitle() {
  if (!data.value || !editTitle.value.trim() || savingTitle.value) return
  savingTitle.value = true
  titleError.value = null
  titleSaved.value = false
  try {
    const { error: err } = await api.api.clothes({ id: id.value }).patch(
      { title: editTitle.value.trim() },
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      titleError.value = val?.error || `Failed to update title (${err.status})`
      return
    }
    titleSaved.value = true
    await refresh()
  }
  catch (e) {
    titleError.value = e instanceof Error ? e.message : 'Failed to update title'
  }
  finally {
    savingTitle.value = false
  }
}

const showVersionUpload = ref(false)
const versionFile = ref<File | null>(null)
const versionNotes = ref('')
const semver = useSemverInput()
const uploadingVersion = ref(false)
const versionError = ref<string | null>(null)
const versionDuplicateHit = ref<UploadDuplicateHit | null>(null)
const deletingVersionId = ref<string | null>(null)

function resetVersionUploadForm() {
  versionFile.value = null
  versionNotes.value = ''
  semver.reset()
  versionError.value = null
  versionDuplicateHit.value = null
}

watch(showVersionUpload, (open) => {
  if (!open) resetVersionUploadForm()
})

function onVersionFileChange(file: File | null | undefined) {
  versionFile.value = file ?? null
  versionError.value = null
  versionDuplicateHit.value = null
}

async function handleDeleteVersion(versionId: string) {
  if (deletingVersionId.value) return
  deletingVersionId.value = versionId
  versionError.value = null
  try {
    const res = await fetch(
      `${apiUrl.value}/api/clothes/${id.value}/versions/${versionId}`,
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
  versionDuplicateHit.value = null

  try {
    const form = new FormData()
    form.append('file', versionFile.value)
    form.append('semver', semver.canonical.value)
    if (versionNotes.value.trim()) {
      form.append('notes', versionNotes.value.trim())
    }

    const res = await fetch(`${apiUrl.value}/api/clothes/${id.value}/versions`, {
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

    showVersionUpload.value = false
    await refresh()
    if (payload && typeof payload.latestVersionId === 'string') {
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

const deletingClothes = ref(false)
const deleteError = ref<string | null>(null)

async function handleDeleteClothes() {
  if (deletingClothes.value) return
  deletingClothes.value = true
  deleteError.value = null

  try {
    const { error: err } = await api.api.clothes({ id: id.value }).delete(
      undefined,
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      deleteError.value = val?.error || `Failed to delete clothes (${err.status})`
      return
    }
    await router.push('/clothes')
  }
  catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete clothes'
  }
  finally {
    deletingClothes.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
    <UButton
      to="/clothes"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="mb-6 px-0"
    >
      Clothes
    </UButton>

    <DetailSkeleton
      v-if="status === 'pending'"
      media="portrait"
    />

    <LoadError
      v-else-if="error || !data"
      title="Clothes unavailable"
      :message="error?.message || 'Not found'"
      @retry="refresh()"
    />

    <div
      v-else
      class="grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-12"
    >
      <aside class="self-start lg:sticky lg:top-24">
        <div class="relative">
          <img
            v-if="imageSrc"
            :src="imageSrc"
            alt=""
            aria-hidden="true"
            class="absolute inset-0 size-full scale-95 rounded-[var(--radius-2xl)] object-cover opacity-60 blur-3xl saturate-150"
          >
          <div class="relative overflow-hidden rounded-[var(--radius-2xl)] border border-default bg-[var(--ed-surface-container-highest)] shadow-[var(--ed-shadow-lift)]">
            <img
              v-if="imageSrc"
              :key="imageSrc"
              :src="imageSrc"
              :alt="data.title"
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
            >
              Clothes
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
              v-if="isAuthor"
              color="secondary"
              variant="subtle"
              icon="i-lucide-badge-check"
            >
              You're the author
            </UBadge>
          </div>

          <h1 class="ed-headline-md text-highlighted">
            {{ data.title }}
          </h1>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <UUser
              :to="`/u/${data.authorId}`"
              :name="data.authorUsername || 'View profile'"
              description="Author"
              :avatar="{ src: data.authorAvatar ?? undefined, alt: data.authorUsername || 'author', icon: 'i-lucide-user' }"
              size="md"
            />
            <div class="flex min-w-0 flex-wrap items-center gap-1 text-xs text-dimmed">
              <span class="font-mono">{{ data.slug }}</span>
              <span aria-hidden="true">·</span>
              <CopyId :value="data.id" />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <UButton
              :href="originalDownloadHref"
              external
              download
              color="primary"
              icon="i-lucide-download"
            >
              Download PNG
            </UButton>
          </div>

          <div class="space-y-2 border-t border-default pt-4">
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
            :deletable="isAuthor"
            :deleting-id="deletingVersionId"
            @delete="handleDeleteVersion"
          />
          <UAlert
            v-if="isAuthor && versionError"
            class="mt-3"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="versionError"
          />
        </SectionCard>

        <SectionCard
          v-if="isAuthor"
          eyebrow="Author controls"
          title="Manage clothes"
          icon="i-lucide-settings-2"
        >
          <div class="space-y-6">
            <form
              class="space-y-2"
              @submit.prevent="saveTitle"
            >
              <UFormField
                label="Title"
                :error="titleError ?? undefined"
                :help="titleSaved && !titleError ? 'Title updated.' : undefined"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <UInput
                    v-model="editTitle"
                    class="min-w-60 flex-1"
                    placeholder="Outfit title"
                  />
                  <UButton
                    type="submit"
                    color="primary"
                    :loading="savingTitle"
                    :disabled="!editTitle.trim() || editTitle.trim() === data.title"
                  >
                    Save
                  </UButton>
                </div>
              </UFormField>
            </form>

            <USeparator />

            <UModal
              v-model:open="showVersionUpload"
              title="Publish new version"
              description="Drop a new clothes PNG to publish another version of this outfit."
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
                  id="clothes-version-upload-form"
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
                  <DuplicateNotice
                    v-if="versionDuplicateHit"
                    :to="`/clothes/${versionDuplicateHit.id}`"
                    :label="versionDuplicateHit.semver ? `version ${versionDuplicateHit.semver}` : 'existing upload'"
                    lead="This file already exists as"
                    @navigate="showVersionUpload = false"
                  />
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
                    form="clothes-version-upload-form"
                    color="primary"
                    icon="i-lucide-check"
                    :loading="uploadingVersion"
                    :disabled="!versionFile || uploadingVersion || Boolean(versionDuplicateHit)"
                  >
                    Publish version
                  </UButton>
                </div>
              </template>
            </UModal>

            <DangerZone
              subject="this outfit"
              :busy="deletingClothes"
              :error="deleteError"
              @confirm="handleDeleteClothes"
            />
          </div>
        </SectionCard>

        <JsonPanel
          v-if="active"
          :title="`Clothes data · v${active.semver}`"
          :value="active.summary ?? {}"
        />
      </div>
    </div>
  </main>
</template>
