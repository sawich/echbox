<script setup lang="ts">
import type { CardListItem, CardType } from '@echbox/shared'

const props = defineProps<{
  type: CardType
  title: string
  description: string
}>()

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user } = useAuth()
const router = useRouter()

const { data, error, status, refresh } = await useAsyncData(
  () => `gallery-${props.type}`,
  async () => {
    const { data: body, error: err } = await api.api.kk.cards.get({
      query: { type: props.type },
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    return (body?.cards ?? []) as CardListItem[]
  },
  { watch: [() => props.type] },
)

const cards = computed(() => data.value ?? [])

const gridClass = computed(() =>
  props.type === 'scene'
    ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5',
)

const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadNotes = ref('')
const uploadBusy = ref(false)
const uploadError = ref<string | null>(null)
const duplicateHit = ref<{ cardId: string, version: number } | null>(null)
const fileInputKey = ref(0)

function resetUploadForm() {
  uploadFile.value = null
  uploadTitle.value = ''
  uploadNotes.value = ''
  uploadError.value = null
  duplicateHit.value = null
  fileInputKey.value += 1
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

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  uploadFile.value = file
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
    const form = new FormData()
    form.append('file', uploadFile.value)
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
  <main class="mx-auto w-full max-w-6xl px-5 py-7 sm:px-6 sm:py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="space-y-1.5">
        <EdLabel>Library</EdLabel>
        <h1 class="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ed-on-surface)] sm:text-4xl">
          {{ title }}
        </h1>
        <p class="ed-body-md max-w-xl text-[var(--ed-on-surface-variant)]">
          {{ description }}
        </p>
      </div>

      <UModal
        v-if="type === 'character' && user"
        v-model:open="showUpload"
        title="Upload character card"
        description="Select a Koikatsu character PNG card to add to the library."
        :ui="{ content: 'sm:max-w-lg' }"
      >
        <UButton
          icon="i-lucide-upload"
          color="primary"
        >
          Upload character
        </UButton>

        <template #body>
          <form
            id="character-upload-form"
            class="grid gap-4"
            @submit.prevent="submitUpload"
          >
            <div class="space-y-1.5">
              <label class="ed-label-md block text-[var(--ed-on-surface-variant)]">
                Character PNG file
              </label>
              <input
                :key="fileInputKey"
                type="file"
                accept="image/png"
                required
                class="block w-full rounded-[var(--radius-md)] border border-[var(--ed-outline-variant)] bg-[var(--ed-surface-container)] px-3 py-2 text-sm text-[var(--ed-on-surface)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--ed-primary-container)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--ed-on-primary-container)]"
                @change="onFileSelected"
              >
            </div>

            <div class="space-y-1.5">
              <label class="ed-label-md block text-[var(--ed-on-surface-variant)]">
                Title (optional, defaults to card name)
              </label>
              <UInput
                v-model="uploadTitle"
                placeholder="Character title"
              />
            </div>

            <div class="space-y-1.5">
              <label class="ed-label-md block text-[var(--ed-on-surface-variant)]">
                Version notes (optional)
              </label>
              <UInput
                v-model="uploadNotes"
                placeholder="Initial release notes"
              />
            </div>

            <div
              v-if="duplicateHit"
              class="rounded-[var(--radius-md)] border border-[var(--ed-secondary)] bg-[color-mix(in_oklab,var(--ed-secondary-container)_40%,transparent)] p-3 text-sm text-[var(--ed-on-secondary-container)]"
            >
              This exact card file already exists in
              <NuxtLink
                :to="`/cards/${duplicateHit.cardId}`"
                class="font-semibold underline"
                @click="showUpload = false"
              >
                card {{ duplicateHit.cardId }} (v{{ duplicateHit.version }})
              </NuxtLink>.
            </div>

            <p
              v-if="uploadError"
              class="ed-body-md text-[var(--ed-error)]"
            >
              {{ uploadError }}
            </p>
          </form>
        </template>

        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-3">
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
    </header>

    <div
      v-if="status === 'pending'"
      class="ed-body-md text-[var(--ed-on-surface-variant)]"
    >
      Loading cards…
    </div>

    <EdSurface
      v-else-if="error"
      :elev="2"
      class="space-y-3 p-5"
    >
      <p class="ed-title-md text-[var(--ed-error)]">
        Could not load gallery
      </p>
      <p class="ed-body-md text-[var(--ed-on-surface-variant)]">
        {{ error.message || 'Is the backend running on the API URL?' }}
      </p>
      <UButton
        size="sm"
        @click="refresh()"
      >
        Retry
      </UButton>
    </EdSurface>

    <p
      v-else-if="cards.length === 0"
      class="ed-body-md text-[var(--ed-on-surface-variant)]"
    >
      No cards yet.
    </p>

    <div
      v-else
      :class="gridClass"
    >
      <CardTile
        v-for="card in cards"
        :key="card.id"
        :card="card"
        :api-url="apiUrl"
      />
    </div>
  </main>
</template>
