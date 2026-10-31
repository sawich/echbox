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
    })
    if (err) throw err
    return (body?.cards ?? []) as CardListItem[]
  },
  { watch: [() => props.type] },
)

const cards = computed(() => data.value ?? [])

const gridClass = computed(() =>
  props.type === 'scene'
    ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4',
)

const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadNotes = ref('')
const uploadBusy = ref(false)
const uploadError = ref<string | null>(null)
const duplicateHit = ref<{ cardId: string, version: number } | null>(null)

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
    uploadFile.value = null
    uploadTitle.value = ''
    uploadNotes.value = ''
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
  <main class="mx-auto w-full max-w-6xl px-6 py-10">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div class="space-y-2">
        <M3Label>Library</M3Label>
        <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--m3-on-surface)] sm:text-4xl">
          {{ title }}
        </h1>
        <p class="m3-body-md max-w-xl text-[var(--m3-on-surface-variant)]">
          {{ description }}
        </p>
      </div>

      <UButton
        v-if="type === 'character' && user"
        icon="i-lucide-upload"
        color="primary"
        :variant="showUpload ? 'soft' : 'solid'"
        @click="showUpload = !showUpload"
      >
        {{ showUpload ? 'Close upload' : 'Upload character' }}
      </UButton>
    </header>

    <M3Surface
      v-if="type === 'character' && user && showUpload"
      :elev="2"
      neon
      class="mb-8 space-y-4 p-6"
    >
      <div class="space-y-1">
        <h2 class="m3-title-md text-[var(--m3-on-surface)]">
          Upload character card
        </h2>
        <p class="m3-body-md text-[var(--m3-on-surface-variant)]">
          Select a Koikatsu character PNG card to add to the library.
        </p>
      </div>

      <form
        class="grid gap-4 sm:grid-cols-2"
        @submit.prevent="submitUpload"
      >
        <div class="space-y-1.5 sm:col-span-2">
          <label class="m3-label-md block text-[var(--m3-on-surface-variant)]">
            Character PNG file
          </label>
          <input
            type="file"
            accept="image/png"
            required
            class="block w-full rounded-[var(--radius-lg)] border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container)] px-3 py-2 text-sm text-[var(--m3-on-surface)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--m3-primary-container)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--m3-on-primary-container)]"
            @change="onFileSelected"
          >
        </div>

        <div class="space-y-1.5">
          <label class="m3-label-md block text-[var(--m3-on-surface-variant)]">
            Title (optional, defaults to card name)
          </label>
          <UInput
            v-model="uploadTitle"
            placeholder="Character title"
          />
        </div>

        <div class="space-y-1.5">
          <label class="m3-label-md block text-[var(--m3-on-surface-variant)]">
            Version notes (optional)
          </label>
          <UInput
            v-model="uploadNotes"
            placeholder="Initial release notes"
          />
        </div>

        <div
          v-if="duplicateHit"
          class="rounded-[var(--radius-lg)] border border-[var(--m3-tertiary)] bg-[color-mix(in_oklab,var(--m3-tertiary-container)_40%,transparent)] p-3 text-sm text-[var(--m3-on-tertiary-container)] sm:col-span-2"
        >
          This exact card file already exists in
          <NuxtLink
            :to="`/cards/${duplicateHit.cardId}`"
            class="underline font-semibold"
          >
            card {{ duplicateHit.cardId }} (v{{ duplicateHit.version }})
          </NuxtLink>.
        </div>

        <p
          v-if="uploadError"
          class="m3-body-md text-[var(--m3-error)] sm:col-span-2"
        >
          {{ uploadError }}
        </p>

        <div class="flex items-center gap-3 sm:col-span-2">
          <UButton
            type="submit"
            color="primary"
            icon="i-lucide-check"
            :loading="uploadBusy"
            :disabled="!uploadFile || uploadBusy || Boolean(duplicateHit)"
          >
            Publish card
          </UButton>
          <UButton
            type="button"
            variant="ghost"
            color="neutral"
            @click="showUpload = false"
          >
            Cancel
          </UButton>
        </div>
      </form>
    </M3Surface>

    <div
      v-if="status === 'pending'"
      class="m3-body-md text-[var(--m3-on-surface-variant)]"
    >
      Loading cards…
    </div>

    <M3Surface
      v-else-if="error"
      :elev="2"
      class="space-y-3 p-6"
    >
      <p class="m3-title-md text-[var(--m3-error)]">
        Could not load gallery
      </p>
      <p class="m3-body-md text-[var(--m3-on-surface-variant)]">
        {{ error.message || 'Is the backend running on the API URL?' }}
      </p>
      <UButton
        size="sm"
        @click="refresh()"
      >
        Retry
      </UButton>
    </M3Surface>

    <p
      v-else-if="cards.length === 0"
      class="m3-body-md text-[var(--m3-on-surface-variant)]"
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
