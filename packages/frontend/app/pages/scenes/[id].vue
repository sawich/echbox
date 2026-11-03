<script setup lang="ts">
import type { CardVoteValue, SceneDetail } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

const route = useRoute()
const router = useRouter()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user, login } = useAuth()

const id = computed(() => String(route.params.id))

const { data, error, status, refresh } = await useAsyncData(
  () => `scene-${id.value}`,
  async () => {
    const { data: scene, error: err } = await api.api.scenes({ id: id.value }).get({
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    if (!scene || !('versions' in scene)) throw new Error('Scene not found')
    return scene as SceneDetail
  },
  { watch: [id] },
)

const selectedVersion = ref<string | null>(null)
const editTitle = ref('')

watch(
  data,
  (scene) => {
    if (!scene) return
    selectedVersion.value = scene.latestVersionId
    editTitle.value = scene.title
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
    const { data: result, error: err } = await api.api.scenes({ id: id.value }).vote.put(
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
  const scene = data.value
  if (!scene) return null
  const versionId = selectedVersion.value ?? scene.latestVersionId
  return scene.versions.find(v => v.id === versionId) ?? scene.versions.at(-1) ?? null
})

const imageSrc = computed(() => {
  if (!active.value) return ''
  return `${apiUrl.value}${active.value.imageUrl}`
})

const originalDownloadHref = computed(() => {
  if (!active.value) return ''
  return `${apiUrl.value}${active.value.imageUrl}?original=1`
})

const previewAspect = computed(() => galleryAspect('scene'))

const savingTitle = ref(false)
const titleError = ref<string | null>(null)
const titleSaved = ref(false)

async function saveTitle() {
  if (!data.value || !editTitle.value.trim() || savingTitle.value) return
  savingTitle.value = true
  titleError.value = null
  titleSaved.value = false
  try {
    const { error: err } = await api.api.scenes({ id: id.value }).patch(
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

const versionFile = ref<File | null>(null)
const versionNotes = ref('')
const semver = useSemverInput()
const uploadingVersion = ref(false)
const versionError = ref<string | null>(null)
const versionDuplicateHit = ref<UploadDuplicateHit | null>(null)

function onVersionFileChange(file: File | null | undefined) {
  versionFile.value = file ?? null
  versionError.value = null
  versionDuplicateHit.value = null
}

async function submitNewVersion() {
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

    const res = await fetch(`${apiUrl.value}/api/scenes/${id.value}/versions`, {
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
    semver.reset()
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

const deletingScene = ref(false)
const deleteError = ref<string | null>(null)

async function handleDeleteScene() {
  if (deletingScene.value) return
  deletingScene.value = true
  deleteError.value = null

  try {
    const { error: err } = await api.api.scenes({ id: id.value }).delete(
      undefined,
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      deleteError.value = val?.error || `Failed to delete scene (${err.status})`
      return
    }
    await router.push('/scenes')
  }
  catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete scene'
  }
  finally {
    deletingScene.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
    <UButton
      to="/scenes"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="mb-6 px-0"
    >
      Scenes
    </UButton>

    <DetailSkeleton
      v-if="status === 'pending'"
      media="landscape"
    />

    <LoadError
      v-else-if="error || !data"
      title="Scene unavailable"
      :message="error?.message || 'Not found'"
      @retry="refresh()"
    />

    <div
      v-else
      class="grid gap-8 lg:grid-cols-[minmax(0,480px)_1fr] lg:gap-12"
    >
      <aside class="self-start lg:sticky lg:top-24">
        <div class="relative">
          <img
            :src="imageSrc"
            alt=""
            aria-hidden="true"
            class="absolute inset-0 size-full scale-95 rounded-[var(--radius-2xl)] object-cover opacity-60 blur-3xl saturate-150"
          >
          <div class="relative overflow-hidden rounded-[var(--radius-2xl)] border border-default bg-[var(--ed-surface-container-highest)] shadow-[var(--ed-shadow-lift)]">
            <img
              :key="imageSrc"
              :src="imageSrc"
              :alt="data.title"
              class="ed-page-enter w-full object-cover"
              :class="previewAspect"
            >
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
              Scene
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
          />
        </SectionCard>

        <SectionCard
          v-if="isAuthor"
          eyebrow="Author controls"
          title="Manage scene"
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
                    placeholder="Scene title"
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

            <form
              class="space-y-3"
              @submit.prevent="submitNewVersion"
            >
              <UFormField label="Publish new version">
                <UFileUpload
                  :model-value="versionFile"
                  accept="image/png"
                  icon="i-lucide-image-up"
                  label="Drop the new PNG here"
                  description="or click to browse"
                  layout="list"
                  class="w-full"
                  @update:model-value="onVersionFileChange"
                />
              </UFormField>
              <UFormField
                label="Version"
                required
                :error="semver.raw.value.trim() ? semver.error.value ?? undefined : undefined"
                help="Semantic version, e.g. 1.0.0"
              >
                <UInput
                  v-model="semver.raw.value"
                  placeholder="1.0.0"
                  class="w-full font-mono"
                />
              </UFormField>
              <UInput
                v-model="versionNotes"
                placeholder="What changed? (optional)"
                class="w-full"
              />
              <DuplicateNotice
                v-if="versionDuplicateHit"
                :to="`/scenes/${versionDuplicateHit.id}`"
                :label="`scene ${versionDuplicateHit.id}${versionDuplicateHit.semver ? ` (v${versionDuplicateHit.semver})` : ''}`"
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
                :disabled="!versionFile || !semver.valid.value || uploadingVersion"
              >
                Publish new version
              </UButton>
            </form>

            <DangerZone
              subject="this scene"
              :busy="deletingScene"
              :error="deleteError"
              @confirm="handleDeleteScene"
            />
          </div>
        </SectionCard>

        <JsonPanel
          :title="`Scene data · v${active?.semver ?? data.latestSemver}`"
          :value="active?.summary ?? {}"
        />
      </div>
    </div>
  </main>
</template>
