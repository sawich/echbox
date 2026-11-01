<script setup lang="ts">
import type { CardListItem, CardType } from '@echbox/shared'
import { type CatalogSort, filterCatalog } from '~/utils/catalog'
import { galleryAspect } from '~/utils/gallery'

const props = defineProps<{
  type: CardType
  title: string
  description: string
  gameId?: string
}>()

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user } = useAuth()
const router = useRouter()
const {
  isDesktop,
  listInstalledContent,
  installContent,
  uninstallContent,
} = useLocalInstalls()

const installedIds = ref<Set<string>>(new Set())

async function refreshInstalled() {
  if (!props.gameId || !isDesktop.value) {
    installedIds.value = new Set()
    return
  }
  const rows = await listInstalledContent(props.gameId, 'cards')
  installedIds.value = new Set(rows.map(r => r.id))
}

const { data, error, status, refresh } = await useAsyncData(
  () => `gallery-${props.type}-${props.gameId ?? 'all'}`,
  async () => {
    const { data: body, error: err } = await api.api.kk.cards.get({
      query: {
        type: props.type,
        ...(props.gameId ? { gameId: props.gameId } : {}),
      },
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    return (body?.cards ?? []) as CardListItem[]
  },
  { watch: [() => props.type, () => props.gameId] },
)

onMounted(() => {
  void refreshInstalled()
})
watch(() => props.gameId, () => {
  void refreshInstalled()
})

const installBusy = ref<string | null>(null)
const installError = ref<string | null>(null)

async function toggleInstall(card: CardListItem) {
  if (!props.gameId) return
  if (!isDesktop.value) {
    installError.value = 'Install is only available in the desktop app'
    return
  }
  installBusy.value = card.id
  installError.value = null
  try {
    if (installedIds.value.has(card.id)) {
      await uninstallContent(props.gameId, 'cards', card.id)
    }
    else {
      await installContent(props.gameId, 'cards', {
        id: card.id,
        version: card.latestVersion,
        title: card.title,
        contentHash: null,
        installedAt: new Date().toISOString(),
      })
    }
    await refreshInstalled()
  }
  catch (err) {
    installError.value = err instanceof Error ? err.message : 'Install failed'
  }
  finally {
    installBusy.value = null
  }
}

const cards = computed(() => data.value ?? [])

const query = ref('')
const sort = ref<CatalogSort>('recent')
const visibleCards = computed(() =>
  filterCatalog(cards.value, query.value, sort.value, card => [card.title, card.slug]),
)
const isPortrait = computed(() => galleryAspect(props.type) === 'aspect-[252/352]')

const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadNotes = ref('')
const uploadBusy = ref(false)
const uploadError = ref<string | null>(null)
const duplicateHit = ref<{ cardId: string, version: number } | null>(null)

function resetUploadForm() {
  uploadFile.value = null
  uploadTitle.value = ''
  uploadNotes.value = ''
  uploadError.value = null
  duplicateHit.value = null
}

watch(showUpload, (open) => {
  if (!open) resetUploadForm()
})

async function computeSha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function onFileSelected(file: File | null | undefined) {
  uploadFile.value = file ?? null
  uploadError.value = null
  duplicateHit.value = null

  if (!file) return

  try {
    const hash = await computeSha256Hex(file)
    const { data: hit, status: hitStatus } = await api.api.kk.cards['by-hash']({ hash }).get()
    if (hitStatus === 200 && hit && 'cardId' in hit) {
      duplicateHit.value = { cardId: hit.cardId, version: hit.version }
    }
  }
  catch {
    // Non-blocking pre-check
  }
}

async function submitUpload() {
  if (!uploadFile.value || uploadBusy.value) return
  uploadBusy.value = true
  uploadError.value = null
  duplicateHit.value = null

  try {
    if (!props.gameId) {
      uploadError.value = 'Select a game before uploading'
      uploadBusy.value = false
      return
    }

    const form = new FormData()
    form.append('file', uploadFile.value)
    form.append('gameId', props.gameId)
    if (uploadTitle.value.trim()) {
      form.append('title', uploadTitle.value.trim())
    }
    if (uploadNotes.value.trim()) {
      form.append('notes', uploadNotes.value.trim())
    }

    const res = await fetch(`${apiUrl.value}/api/kk/cards`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 409 && payload && (payload.cardId || payload.card_id)) {
        duplicateHit.value = {
          cardId: payload.cardId ?? payload.card_id,
          version: payload.version ?? 1,
        }
      }
      uploadError.value = payload?.error || `Upload failed (${res.status})`
      return
    }

    showUpload.value = false
    await refresh()
    if (payload?.id) {
      await router.push(`/cards/${payload.id}`)
    }
  }
  catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  }
  finally {
    uploadBusy.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
    <PageHeader
      eyebrow="Library"
      icon="i-lucide-user-round"
      :title="title"
      :description="description"
      :count="status === 'success' ? cards.length : null"
    >
      <template #actions>
          <UModal
          v-if="type === 'character' && user && gameId"
          v-model:open="showUpload"
          title="Upload character card"
          description="Drop a Koikatsu character PNG to add it to the library."
          :ui="{ content: 'sm:max-w-lg' }"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="lg"
          >
            Upload character
          </UButton>

          <template #body>
            <form
              id="character-upload-form"
              class="grid gap-5"
              @submit.prevent="submitUpload"
            >
              <UFileUpload
                :model-value="uploadFile"
                accept="image/png"
                icon="i-lucide-image-up"
                label="Drop character PNG here"
                description="or click to browse · PNG only"
                layout="list"
                class="min-h-40"
                @update:model-value="onFileSelected"
              />

              <UFormField
                label="Title"
                hint="Optional"
                help="Defaults to the card name."
              >
                <UInput
                  v-model="uploadTitle"
                  placeholder="Character title"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Version notes"
                hint="Optional"
              >
                <UInput
                  v-model="uploadNotes"
                  placeholder="Initial release notes"
                  class="w-full"
                />
              </UFormField>

              <DuplicateNotice
                v-if="duplicateHit"
                :to="`/cards/${duplicateHit.cardId}`"
                :label="`card ${duplicateHit.cardId} (v${duplicateHit.version})`"
                lead="This exact card file already exists in"
                @navigate="showUpload = false"
              />

              <UAlert
                v-if="uploadError"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="uploadError"
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
                form="character-upload-form"
                color="primary"
                icon="i-lucide-check"
                :loading="uploadBusy"
                :disabled="!uploadFile || uploadBusy || Boolean(duplicateHit)"
              >
                Publish card
              </UButton>
            </div>
          </template>
        </UModal>
      </template>
    </PageHeader>

    <CatalogToolbar
      v-if="status === 'success' && cards.length > 0"
      v-model:query="query"
      v-model:sort="sort"
      :ratings="type === 'character'"
      placeholder="Search by title or slug…"
    />

    <GallerySkeleton
      v-if="status === 'pending'"
      :variant="isPortrait ? 'portrait' : 'landscape'"
    />

    <LoadError
      v-else-if="error"
      title="Could not load gallery"
      :message="error.message"
      @retry="refresh()"
    />

    <UEmpty
      v-else-if="cards.length === 0"
      icon="i-lucide-images"
      title="No cards yet"
      :description="user ? 'Be the first to share one.' : 'Sign in to share the first one.'"
      variant="soft"
      class="py-16"
    />

    <UEmpty
      v-else-if="visibleCards.length === 0"
      icon="i-lucide-search-x"
      title="Nothing matches"
      :description="`No cards match “${query}”.`"
      variant="naked"
      :actions="[{ label: 'Clear search', color: 'neutral', variant: 'outline', onClick: () => { query = '' } }]"
      class="py-16"
    />

    <UAlert
      v-if="installError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="installError"
      class="mb-4"
    />

    <div
      v-if="status === 'success' && visibleCards.length > 0"
      class="ed-stagger grid gap-4"
      :class="isPortrait
        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'"
    >
      <div
        v-for="card in visibleCards"
        :key="card.id"
        class="space-y-2"
      >
        <CardTile
          :card="card"
          :api-url="apiUrl"
        />
        <UButton
          v-if="gameId"
          block
          size="sm"
          :color="installedIds.has(card.id) ? 'neutral' : 'primary'"
          :variant="installedIds.has(card.id) ? 'outline' : 'solid'"
          :loading="installBusy === card.id"
          :disabled="!isDesktop && !installedIds.has(card.id)"
          @click="toggleInstall(card)"
        >
          {{ installedIds.has(card.id) ? 'Uninstall' : (isDesktop ? 'Install' : 'Desktop only') }}
        </UButton>
      </div>
    </div>
  </main>
</template>
