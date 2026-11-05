<script setup lang="ts">
import { DEFAULT_PAGE_LIMIT, type CatalogSort, type SceneListItem } from '@echbox/shared'
import { contentLabel } from '~/utils/content-label'
import { postCreateFollowUp, replaceContentTags } from '~/utils/content-tags'
import { aggregatePageTags } from '~/utils/page-tags'
import { tagFilterQuery } from '~/utils/tag-filter'

const props = defineProps<{
  gameId?: string
  instanceId?: string
  title?: string
  description?: string
  contentRelPath?: string | null
  /** Small label above the title; defaults to the section name. */
  eyebrow?: string
}>()

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user } = useAuth()
const router = useRouter()
const {
  isDesktop,
  listInstalledContent,
} = useLocalInstalls()
const {
  runContentInstall,
  runContentUninstall,
  isTargetBusy,
} = useAppTasks()

const installedIds = ref<Set<string>>(new Set())
const installError = ref<string | null>(null)

async function refreshInstalled() {
  if (!props.instanceId || !isDesktop.value) {
    installedIds.value = new Set()
    return
  }
  const rows = await listInstalledContent(props.instanceId, 'scenes')
  installedIds.value = new Set(rows.map(r => r.id))
}

onMounted(() => { void refreshInstalled() })
watch(() => [props.gameId, props.instanceId], () => { void refreshInstalled() })

async function toggleInstall(scene: SceneListItem) {
  if (!props.instanceId) return
  if (isTargetBusy(scene.id)) return
  if (!isDesktop.value) {
    installError.value = 'Install is only available in the desktop app'
    return
  }
  if (!installedIds.value.has(scene.id) && (!scene.latestVersionId || !scene.latestSemver)) {
    installError.value = 'This scene has no versions to install'
    return
  }
  installError.value = null
  try {
    if (installedIds.value.has(scene.id)) {
      await runContentUninstall({
        instanceId: props.instanceId,
        kind: 'scenes',
        contentId: scene.id,
        title: contentLabel(scene.description, scene.id),
      })
    } else {
      await runContentInstall({
        instanceId: props.instanceId,
        kind: 'scenes',
        row: {
          id: scene.id,
          versionId: scene.latestVersionId!,
          semver: scene.latestSemver!,
          title: contentLabel(scene.description, scene.id),
          contentHash: null,
          installedAt: new Date().toISOString(),
        },
        apiUrl: apiUrl.value,
        relPath: props.contentRelPath,
      })
    }
    await refreshInstalled()
  } catch (err) {
    installError.value = err instanceof Error ? err.message : 'Install failed'
  }
}

const page = ref(1)
const tags = ref<string[]>([])
const appliedTags = ref<string[]>([])
const sort = ref<CatalogSort>('recent')

function onApplyTags(next: string[]) {
  if (next.join('\n') === appliedTags.value.join('\n')) return
  appliedTags.value = [...next]
}

function clearTags() {
  tags.value = []
  onApplyTags([])
}

function onSelectSidebarTag(name: string) {
  if (tags.value.includes(name)) return
  const next = [...tags.value, name]
  tags.value = next
  onApplyTags(next)
}

watch([() => appliedTags.value.join('\n'), sort, () => props.gameId], () => {
  page.value = 1
})

const { data, error, status, refresh } = await useAsyncData(
  () => `scenes-gallery-${props.gameId ?? 'all'}-${page.value}-${appliedTags.value.join(',')}-${sort.value}`,
  async () => {
    const { data: body, error: err } = await api.api.scenes.get({
      query: {
        page: page.value,
        limit: DEFAULT_PAGE_LIMIT,
        sort: sort.value === 'top' ? 'top' : 'recent',
        ...tagFilterQuery(appliedTags.value),
        ...(props.gameId ? { gameId: props.gameId } : {}),
      },
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    return {
      scenes: (body?.scenes ?? []) as SceneListItem[],
      total: Number(body?.total ?? 0),
    }
  },
  { watch: [() => props.gameId, page, appliedTags, sort] },
)

const scenes = computed(() => data.value?.scenes ?? [])
const pageTags = computed(() => aggregatePageTags(scenes.value))
const total = computed(() => data.value?.total ?? 0)

const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadDescription = ref('')
const uploadTags = ref<string[]>([])
const uploadNotes = ref('')
const uploadBusy = ref(false)
const uploadError = ref<string | null>(null)
const semver = useSemverInput()
const duplicateHit = ref<{ sceneId: string, semver: string } | null>(null)
const publishedId = ref<string | null>(null)

function resetUploadForm() {
  uploadFile.value = null
  uploadDescription.value = ''
  uploadTags.value = []
  uploadNotes.value = ''
  semver.reset()
  uploadError.value = null
  duplicateHit.value = null
  publishedId.value = null
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
      duplicateHit.value = { sceneId: hit.sceneId, semver: hit.semver }
    }
  }
  catch {
    // Non-blocking pre-check
  }
}

async function submitUpload() {
  semver.markTried()
  if (!semver.valid.value) return

  if (!uploadFile.value || uploadBusy.value || !semver.canonical.value) return
  uploadBusy.value = true
  uploadError.value = null
  duplicateHit.value = null

  try {
    if (!props.gameId) {
      uploadError.value = 'Select a game before uploading'
      uploadBusy.value = false
      return
    }
    let id = publishedId.value
    if (!id) {
      const form = new FormData()
      form.append('file', uploadFile.value)
      form.append('gameId', props.gameId)
      form.append('semver', semver.canonical.value)
      if (uploadDescription.value.trim()) {
        form.append('description', uploadDescription.value.trim())
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
          duplicateHit.value = { sceneId: dup.id, semver: dup.semver ?? '' }
        }
        uploadError.value = (payload?.error as string | undefined) || `Upload failed (${res.status})`
        return
      }

      id = (payload?.id as string | undefined) ?? null
      if (!id) {
        uploadError.value = 'Upload succeeded but returned no id'
        return
      }
      publishedId.value = id
    }

    const tagError = await replaceContentTags(apiUrl.value, 'scenes', id, uploadTags.value)
    const followUp = postCreateFollowUp([tagError])
    if (!followUp.navigate) {
      uploadError.value = followUp.error
      await refresh()
      return
    }
    showUpload.value = false
    await refresh()
    await router.push(`/scenes/${id}`)
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
  <main class="ed-page-enter w-full space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <PageHeader
      :eyebrow="eyebrow ?? 'Library'"
      icon="i-lucide-clapperboard"
      :title="title || 'Scenes'"
      :description="description || 'Studio scene cards (320×180). Open a scene to browse its versions.'"
      :count="data ? total : null"
    >
      <template #actions>
        <UModal
          v-if="user && gameId"
          v-model:open="showUpload"
          title="Upload scene"
          description="Drop a Koikatsu studio scene PNG to add it to the library."
          :ui="{ content: 'sm:max-w-lg' }"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
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
                label="Description"
                hint="Optional"
              >
                <UTextarea
                  v-model="uploadDescription"
                  placeholder="What is this scene?"
                  :rows="3"
                  autoresize
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Tags">
                <ContentTagEditor
                  v-model="uploadTags"
                  kind="scenes"
                />
              </UFormField>

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
                  v-model="uploadNotes"
                  placeholder="Initial release notes"
                  class="w-full"
                />
              </UFormField>

              <DuplicateNotice
                v-if="duplicateHit"
                :to="`/scenes/${duplicateHit.sceneId}`"
                :label="`version ${duplicateHit.semver}`"
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
      v-if="total > 0 || tags.length > 0"
      v-model:tags="tags"
      v-model:sort="sort"
      search="tags"
      placeholder="Filter by tags…"
      @apply="onApplyTags"
    />

    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-6">
      <div class="min-w-0 space-y-4">
        <GallerySkeleton
          v-if="status === 'pending' && !data"
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
          v-else-if="total === 0 && appliedTags.length === 0"
          icon="i-lucide-clapperboard"
          title="No scenes yet"
          :description="user ? 'Be the first to share one.' : 'Sign in to share the first one.'"
          variant="soft"
          class="py-16"
        />

        <UEmpty
          v-else-if="scenes.length === 0"
          icon="i-lucide-search-x"
          title="Nothing matches"
          :description="`No scenes match ${appliedTags.join(' + ')}.`"
          variant="naked"
          :actions="[{ label: 'Clear tags', color: 'neutral', variant: 'outline', onClick: clearTags }]"
          class="py-16"
        />

        <UAlert
          v-if="installError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="installError"
        />

        <div
          v-if="scenes.length > 0"
          class="ed-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3"
        >
          <div
            v-for="scene in scenes"
            :key="scene.id"
            class="space-y-2"
          >
            <SceneTile
              :scene="scene"
              :api-url="apiUrl"
            />
            <UButton
              v-if="instanceId"
              block
              size="sm"
              :color="installedIds.has(scene.id) ? 'neutral' : 'primary'"
              :variant="installedIds.has(scene.id) ? 'outline' : 'solid'"
              :loading="isTargetBusy(scene.id)"
              :disabled="!isDesktop && !installedIds.has(scene.id)"
              @click="toggleInstall(scene)"
            >
              {{ installedIds.has(scene.id) ? 'Uninstall' : (isDesktop ? 'Install' : 'Desktop only') }}
            </UButton>
          </div>
        </div>

        <div
          v-if="total > DEFAULT_PAGE_LIMIT"
          class="flex justify-center pt-2"
        >
          <UPagination
            v-model:page="page"
            :total="total"
            :items-per-page="DEFAULT_PAGE_LIMIT"
          />
        </div>
      </div>

      <GalleryTagSidebar
        v-if="pageTags.length > 0"
        class="mt-6 hidden lg:mt-0 lg:block"
        :tags="pageTags"
        :selected="appliedTags"
        @select="onSelectSidebarTag"
      />
    </div>
  </main>
</template>
