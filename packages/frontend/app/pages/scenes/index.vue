<script setup lang="ts">
import type { SceneListItem } from '@echbox/shared'
import { type CatalogSort, filterCatalog } from '~/utils/catalog'

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user } = useAuth()
const router = useRouter()

const { data, error, status, refresh } = await useAsyncData(
  'scenes-gallery',
  async () => {
    const { data: body, error: err } = await api.api.scenes.get({
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    return (body?.scenes ?? []) as SceneListItem[]
  },
)

const scenes = computed(() => data.value ?? [])

const query = ref('')
const sort = ref<CatalogSort>('recent')
const visibleScenes = computed(() =>
  filterCatalog(scenes.value, query.value, sort.value, scene => [scene.title, scene.slug]),
)

const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadNotes = ref('')
const uploadBusy = ref(false)
const uploadError = ref<string | null>(null)
const duplicateHit = ref<{ sceneId: string, version: number } | null>(null)

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
    const { data: hit, status: hitStatus } = await api.api.scenes['by-hash']({ hash }).get()
    if (hitStatus === 200 && hit && 'sceneId' in hit) {
      duplicateHit.value = { sceneId: hit.sceneId, version: hit.version }
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

    const res = await fetch(`${apiUrl.value}/api/scenes`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })

    const payload = await res.json().catch(() => null) as Record<string, unknown> | null
    if (!res.ok) {
      const dup = parseUploadDuplicatePayload(payload)
      if (res.status === 409 && dup) {
        duplicateHit.value = { sceneId: dup.id, version: dup.version ?? 1 }
      }
      uploadError.value = (payload?.error as string | undefined) || `Upload failed (${res.status})`
      return
    }

    showUpload.value = false
    await refresh()
    const id = (payload?.id as string | undefined)
    if (id) {
      await router.push(`/scenes/${id}`)
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
      icon="i-lucide-clapperboard"
      title="Scenes"
      description="Studio scene cards (320×180). Open a scene to browse its versions."
      :count="status === 'success' ? scenes.length : null"
    >
      <template #actions>
        <UModal
          v-if="user"
          v-model:open="showUpload"
          title="Upload scene"
          description="Drop a Koikatsu studio scene PNG to add it to the library."
          :ui="{ content: 'sm:max-w-lg' }"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="lg"
          >
            Upload scene
          </UButton>

          <template #body>
            <form
              id="scene-upload-form"
              class="grid gap-5"
              @submit.prevent="submitUpload"
            >
              <UFileUpload
                :model-value="uploadFile"
                accept="image/png"
                icon="i-lucide-image-up"
                label="Drop scene PNG here"
                description="or click to browse · PNG only"
                layout="list"
                class="min-h-40"
                @update:model-value="onFileSelected"
              />

              <UFormField
                label="Title"
                hint="Optional"
                help="Defaults to the scene name."
              >
                <UInput
                  v-model="uploadTitle"
                  placeholder="Scene title"
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
                :to="`/scenes/${duplicateHit.sceneId}`"
                :label="`scene ${duplicateHit.sceneId} (v${duplicateHit.version})`"
                lead="This exact scene file already exists in"
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
                form="scene-upload-form"
                color="primary"
                icon="i-lucide-check"
                :loading="uploadBusy"
                :disabled="!uploadFile || uploadBusy || Boolean(duplicateHit)"
              >
                Publish scene
              </UButton>
            </div>
          </template>
        </UModal>
      </template>
    </PageHeader>

    <CatalogToolbar
      v-if="status === 'success' && scenes.length > 0"
      v-model:query="query"
      v-model:sort="sort"
      placeholder="Search scenes…"
    />

    <GallerySkeleton
      v-if="status === 'pending'"
      variant="landscape"
      :count="6"
    />

    <LoadError
      v-else-if="error"
      title="Could not load gallery"
      :message="error.message"
      @retry="refresh()"
    />

    <UEmpty
      v-else-if="scenes.length === 0"
      icon="i-lucide-clapperboard"
      title="No scenes yet"
      :description="user ? 'Be the first to share one.' : 'Sign in to share the first one.'"
      variant="soft"
      class="py-16"
    />

    <UEmpty
      v-else-if="visibleScenes.length === 0"
      icon="i-lucide-search-x"
      title="Nothing matches"
      :description="`No scenes match “${query}”.`"
      variant="naked"
      :actions="[{ label: 'Clear search', color: 'neutral', variant: 'outline', onClick: () => { query = '' } }]"
      class="py-16"
    />

    <div
      v-else
      class="ed-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <SceneTile
        v-for="scene in visibleScenes"
        :key="scene.id"
        :scene="scene"
        :api-url="apiUrl"
      />
    </div>
  </main>
</template>
