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

const selectedVersion = ref<number | null>(null)
const editTitle = ref('')

watch(
  data,
  (card) => {
    if (!card) return
    selectedVersion.value = card.latestVersion
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
  const version = selectedVersion.value ?? card.latestVersion
  return card.versions.find(v => v.version === version) ?? card.versions.at(-1) ?? null
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
const uploadingVersion = ref(false)
const versionError = ref<string | null>(null)

function onVersionFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  versionFile.value = input.files?.[0] ?? null
  versionError.value = null
}

async function submitNewVersion() {
  if (!versionFile.value || uploadingVersion.value) return
  uploadingVersion.value = true
  versionError.value = null

  try {
    const form = new FormData()
    form.append('file', versionFile.value)
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
    await refresh()
    if (payload?.version) {
      selectedVersion.value = payload.version
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
const confirmingDelete = ref(false)
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
  <main class="mx-auto w-full max-w-5xl px-5 py-7 sm:px-6 sm:py-8">
    <div class="mb-6">
      <UButton
        to="/"
        variant="ghost"
        color="neutral"
        size="sm"
        icon="i-lucide-arrow-left"
      >
        Gallery
      </UButton>
    </div>

    <div
      v-if="status === 'pending'"
      class="ed-body-md text-[var(--ed-on-surface-variant)]"
    >
      Loading card…
    </div>

    <EdSurface
      v-else-if="error || !data"
      :elev="2"
      class="space-y-3 p-6"
    >
      <p class="ed-title-md text-[var(--ed-error)]">
        Card unavailable
      </p>
      <p class="ed-body-md text-[var(--ed-on-surface-variant)]">
        {{ error?.message || 'Not found' }}
      </p>
    </EdSurface>

    <div
      v-else
      class="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]"
    >
      <EdSurface
        :elev="2"
        class="overflow-hidden"
      >
        <img
          :src="imageSrc"
          :alt="data.title"
          class="w-full object-cover"
          :class="previewAspect"
        >
      </EdSurface>

      <div class="space-y-6">
        <header class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
            >
              {{ data.type }}
            </UBadge>
            <UBadge
              v-if="data.versions.length > 1"
              color="primary"
            >
              {{ data.versions.length }} versions
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
            {{ data.slug }} · {{ data.id }}
          </p>
          <p
            v-if="data.authorId"
            class="ed-label-md text-[var(--ed-on-surface-variant)]"
          >
            Author:
            <NuxtLink
              :to="`/u/${data.authorId}`"
              class="inline-flex items-center gap-1.5 text-[var(--ed-primary)] underline-offset-2 hover:underline"
            >
              <img
                v-if="data.authorAvatar"
                :src="data.authorAvatar"
                :alt="data.authorUsername || 'author'"
                class="size-5 rounded-full object-cover"
              >
              {{ data.authorUsername || 'view profile' }}
            </NuxtLink>
          </p>
        </header>

        <section
          v-if="data.type === 'character'"
          class="space-y-2"
        >
          <h2 class="ed-title-md text-[var(--ed-on-surface)]">
            Rating
          </h2>
          <CardVoteControls
            :likes="data.likes ?? 0"
            :dislikes="data.dislikes ?? 0"
            :my-vote="data.myVote ?? null"
            :interactive="canVote"
            :busy="voteBusy"
            @vote="submitVote"
          />
          <p
            v-if="!user && data.type === 'character'"
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
              Manage character card
            </h2>
          </div>

          <form
            class="space-y-2"
            @submit.prevent="saveTitle"
          >
            <label class="ed-label-md block text-[var(--ed-on-surface-variant)]">
              Edit title
            </label>
            <div class="flex flex-wrap items-center gap-2">
              <UInput
                v-model="editTitle"
                class="min-w-60 flex-1"
                placeholder="Character title"
              />
              <UButton
                type="submit"
                size="sm"
                color="primary"
                :loading="savingTitle"
                :disabled="!editTitle.trim() || editTitle.trim() === data.title"
              >
                Save title
              </UButton>
            </div>
            <p
              v-if="titleError"
              class="ed-body-md text-[var(--ed-error)]"
            >
              {{ titleError }}
            </p>
            <p
              v-else-if="titleSaved"
              class="ed-label-md text-[var(--ed-secondary)]"
            >
              Title updated.
            </p>
          </form>

          <form
            class="space-y-3 border-t border-[var(--ed-outline-variant)] pt-4"
            @submit.prevent="submitNewVersion"
          >
            <label class="ed-label-md block text-[var(--ed-on-surface-variant)]">
              Upload new version (PNG)
            </label>
            <input
              type="file"
              accept="image/png"
              required
              class="block w-full rounded-[var(--radius-md)] border border-[var(--ed-outline-variant)] bg-[var(--ed-surface-container)] px-3 py-2 text-sm text-[var(--ed-on-surface)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--ed-primary-container)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--ed-on-primary-container)]"
              @change="onVersionFileChange"
            >
            <UInput
              v-model="versionNotes"
              placeholder="Version notes (optional)"
            />
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
                Delete this character card and all versions permanently
              </span>
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                @click="confirmingDelete = true"
              >
                Delete card
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
                :loading="deletingCard"
                @click="handleDeleteCard"
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

        <EdSurface
          :elev="1"
          class="space-y-2 overflow-x-auto p-4"
        >
          <h2 class="ed-title-md text-[var(--ed-on-surface)]">
            Summary
          </h2>
          <pre class="ed-body-md max-h-80 overflow-auto font-mono text-xs text-[var(--ed-on-surface-variant)]">{{ JSON.stringify(active?.summary ?? {}, null, 2) }}</pre>
        </EdSurface>
      </div>
    </div>
  </main>
</template>
