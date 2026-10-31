<script setup lang="ts">
import type { CardDetail } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

type CardDetailWithAuthor = CardDetail & {
  authorId?: string
}

const route = useRoute()
const router = useRouter()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user } = useAuth()

const id = computed(() => String(route.params.id))

const { data, error, status, refresh } = await useAsyncData(
  () => `card-${id.value}`,
  async () => {
    const { data: card, error: err } = await api.api.kk.cards({ id: id.value }).get()
    if (err) throw err
    if (!card || !('versions' in card)) throw new Error('Card not found')
    return card as CardDetailWithAuthor
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

const galleryBackTo = computed(() =>
  data.value?.type === 'scene' ? '/scenes' : '/',
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
  <main class="mx-auto w-full max-w-5xl px-6 py-10">
    <div class="mb-6">
      <UButton
        :to="galleryBackTo"
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
      class="m3-body-md text-[var(--m3-on-surface-variant)]"
    >
      Loading card…
    </div>

    <M3Surface
      v-else-if="error || !data"
      :elev="2"
      class="space-y-3 p-6"
    >
      <p class="m3-title-md text-[var(--m3-error)]">
        Card unavailable
      </p>
      <p class="m3-body-md text-[var(--m3-on-surface-variant)]">
        {{ error?.message || 'Not found' }}
      </p>
    </M3Surface>

    <div
      v-else
      class="grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr]"
    >
      <M3Surface
        :elev="2"
        class="overflow-hidden"
      >
        <img
          :src="imageSrc"
          :alt="data.title"
          class="w-full object-cover"
          :class="previewAspect"
        >
      </M3Surface>

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
          <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--m3-on-surface)]">
            {{ data.title }}
          </h1>
          <p class="m3-label-md text-[var(--m3-on-surface-variant)]">
            {{ data.slug }} · {{ data.id }}
          </p>
        </header>

        <section class="space-y-3">
          <h2 class="m3-title-md text-[var(--m3-on-surface)]">
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
            class="m3-body-md text-[var(--m3-on-surface-variant)]"
          >
            {{ active.notes }}
          </p>
          <p class="m3-label-md text-[var(--m3-on-surface-variant)]">
            {{ active?.createdAt }}
          </p>
        </section>

        <M3Surface
          v-if="isAuthor"
          :elev="2"
          class="space-y-6 p-5"
        >
          <div class="space-y-1">
            <M3Label>Author controls</M3Label>
            <h2 class="m3-title-md text-[var(--m3-on-surface)]">
              Manage character card
            </h2>
          </div>

          <form
            class="space-y-2"
            @submit.prevent="saveTitle"
          >
            <label class="m3-label-md block text-[var(--m3-on-surface-variant)]">
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
              class="m3-body-md text-[var(--m3-error)]"
            >
              {{ titleError }}
            </p>
            <p
              v-else-if="titleSaved"
              class="m3-label-md text-[var(--m3-secondary)]"
            >
              Title updated.
            </p>
          </form>

          <form
            class="space-y-3 border-t border-[var(--m3-outline-variant)] pt-4"
            @submit.prevent="submitNewVersion"
          >
            <label class="m3-label-md block text-[var(--m3-on-surface-variant)]">
              Upload new version (PNG)
            </label>
            <input
              type="file"
              accept="image/png"
              required
              class="block w-full rounded-[var(--radius-lg)] border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container)] px-3 py-2 text-sm text-[var(--m3-on-surface)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--m3-primary-container)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--m3-on-primary-container)]"
              @change="onVersionFileChange"
            >
            <UInput
              v-model="versionNotes"
              placeholder="Version notes (optional)"
            />
            <p
              v-if="versionError"
              class="m3-body-md text-[var(--m3-error)]"
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

          <div class="space-y-2 border-t border-[var(--m3-outline-variant)] pt-4">
            <div
              v-if="!confirmingDelete"
              class="flex items-center justify-between gap-4"
            >
              <span class="m3-label-md text-[var(--m3-on-surface-variant)]">
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
              <span class="m3-label-md text-[var(--m3-error)]">
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
              class="m3-body-md text-[var(--m3-error)]"
            >
              {{ deleteError }}
            </p>
          </div>
        </M3Surface>

        <M3Surface
          :elev="1"
          class="space-y-2 overflow-x-auto p-4"
        >
          <h2 class="m3-title-md text-[var(--m3-on-surface)]">
            Summary
          </h2>
          <pre class="m3-body-md max-h-80 overflow-auto font-mono text-xs text-[var(--m3-on-surface-variant)]">{{ JSON.stringify(active?.summary ?? {}, null, 2) }}</pre>
        </M3Surface>
      </div>
    </div>
  </main>
</template>
