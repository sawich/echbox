<script setup lang="ts">
import type { CardDetail, CardVoteValue } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

type CardDetailWithVotes = CardDetail & {
  authorId?: string
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
const { user, login } = useAuth()

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
const editTitle = ref('')

watch(
  data,
  (card) => {
    if (!card) return
    selectedVersion.value = card.latestVersionId
    editTitle.value = card.title
  },
  { immediate: true },
)

const isAuthor = computed(() => {
  const card = data.value
  if (!card || card.type !== 'character' || !user.value) return false
  return Boolean(card.authorId && card.authorId === user.value.id)
})

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

const imageSrc = computed(() => {
  if (!active.value) return ''
  return `${apiUrl.value}${active.value.imageUrl}`
})

const previewAspect = computed(() =>
  data.value ? galleryAspect(data.value.type) : galleryAspect('character'),
)

// Author state: patch title
const savingTitle = ref(false)
const titleError = ref<string | null>(null)
const titleSaved = ref(false)

async function saveTitle() {
  if (!data.value || !editTitle.value.trim() || savingTitle.value) return
  savingTitle.value = true
  titleError.value = null
  titleSaved.value = false
  try {
    const { error: err } = await api.api.kk.cards({ id: id.value }).patch(
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

// Author state: upload new version
const versionFile = ref<File | null>(null)
const versionNotes = ref('')
const semver = useSemverInput()
const uploadingVersion = ref(false)
const versionError = ref<string | null>(null)

function onVersionFileChange(file: File | null | undefined) {
  versionFile.value = file ?? null
  versionError.value = null
}

async function submitNewVersion() {
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

    versionFile.value = null
    versionNotes.value = ''
    semver.reset()
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
  <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
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
              v-if="data.authorId"
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

          <div
            v-if="data.type === 'character'"
            class="space-y-2 border-t border-default pt-4"
          >
            <CardVoteControls
              :likes="data.likes ?? 0"
              :dislikes="data.dislikes ?? 0"
              :my-vote="data.myVote ?? null"
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
          title="Manage character card"
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
                    placeholder="Character title"
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
              subject="this character card"
              :busy="deletingCard"
              :error="deleteError"
              @confirm="handleDeleteCard"
            />
          </div>
        </SectionCard>

        <JsonPanel
          :title="`Card data · v${active?.semver ?? data.latestSemver}`"
          :value="active?.summary ?? {}"
        />
      </div>
    </div>
  </main>
</template>
