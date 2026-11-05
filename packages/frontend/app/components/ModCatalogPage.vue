<script setup lang="ts">
import { DEFAULT_PAGE_LIMIT, type CatalogSort, type PluginListItem, type SoftmodListItem } from '@echbox/shared'
import { tagFilterQuery } from '~/utils/tag-filter'

const props = defineProps<{
  modKind: 'plugin' | 'softmod'
  title: string
  description: string
  gameId?: string
  instanceId?: string
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

const contentKind = computed(() =>
  props.modKind === 'plugin' ? 'plugins' as const : 'softmods' as const,
)
const installedIds = ref<Set<string>>(new Set())
const installError = ref<string | null>(null)

async function refreshInstalled() {
  if (!props.instanceId || !isDesktop.value) {
    installedIds.value = new Set()
    return
  }
  const rows = await listInstalledContent(props.instanceId, contentKind.value)
  installedIds.value = new Set(rows.map(r => r.id))
}

onMounted(() => {
  void refreshInstalled()
})
watch(() => [props.gameId, props.modKind, props.instanceId], () => {
  void refreshInstalled()
})

const page = ref(1)
const query = ref('')
const debouncedQuery = refDebounced(query, 250)
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

const listFilterKey = computed(() =>
  props.modKind === 'plugin' ? debouncedQuery.value : appliedTags.value.join(','),
)

watch([listFilterKey, sort, () => props.gameId, () => props.modKind], () => {
  page.value = 1
})

const { data, error, status, refresh } = await useAsyncData(
  () => `catalog-${props.modKind}-${props.gameId ?? 'all'}-${page.value}-${listFilterKey.value}-${sort.value}`,
  async () => {
    if (props.modKind === 'plugin') {
      const { data: body, error: err } = await api.api.plugins.get({
        query: {
          page: page.value,
          limit: DEFAULT_PAGE_LIMIT,
          sort: sort.value,
          ...(debouncedQuery.value.trim() ? { q: debouncedQuery.value.trim() } : {}),
          ...(props.gameId ? { gameId: props.gameId } : {}),
        },
        fetch: { credentials: 'include' },
      })
      if (err) throw err
      return {
        items: (body?.plugins ?? []) as PluginListItem[],
        total: Number(body?.total ?? 0),
      }
    }
    const { data: body, error: err } = await api.api.softmods.get({
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
      items: (body?.softmods ?? []) as SoftmodListItem[],
      total: Number(body?.total ?? 0),
    }
  },
  { watch: [() => props.modKind, () => props.gameId, page, debouncedQuery, appliedTags, sort] },
)

async function toggleInstall(item: PluginListItem | SoftmodListItem) {
  if (!props.instanceId) return
  if (isTargetBusy(item.id)) return
  if (!isDesktop.value) {
    installError.value = 'Install is only available in the desktop app'
    return
  }
  if (!installedIds.value.has(item.id) && (!item.latestVersionId || !item.latestSemver)) {
    installError.value = 'This item has no versions to install'
    return
  }
  installError.value = null
  try {
    if (installedIds.value.has(item.id)) {
      await runContentUninstall({
        instanceId: props.instanceId,
        kind: contentKind.value,
        contentId: item.id,
        title: item.title,
      })
    }
    else {
      await runContentInstall({
        instanceId: props.instanceId,
        kind: contentKind.value,
        row: {
          id: item.id,
          versionId: item.latestVersionId!,
          semver: item.latestSemver!,
          title: item.title,
          contentHash: null,
          installedAt: new Date().toISOString(),
        },
        apiUrl: apiUrl.value,
        relPath: props.contentRelPath,
      })
    }
    await refreshInstalled()
  }
  catch (err) {
    installError.value = err instanceof Error ? err.message : 'Install failed'
  }
}

const items = computed<(PluginListItem | SoftmodListItem)[]>(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)

const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadDescription = ref('')
const uploadNotes = ref('')
const uploadBusy = ref(false)
const uploadError = ref<string | null>(null)
const semver = useSemverInput()
const duplicateHit = ref<{ id: string, semver?: string } | null>(null)

const uploadAccept = computed(() =>
  props.modKind === 'plugin' ? '.zip,application/zip' : '.zipmod',
)

const uploadModalTitle = computed(() =>
  props.modKind === 'plugin' ? 'Upload plugin' : 'Upload softmod',
)

const uploadModalDescription = computed(() =>
  props.modKind === 'plugin'
    ? 'Select a BepInEx plugin ZIP and provide a title.'
    : 'Select a Koikatsu softmod (.zipmod) file. Title and metadata come from the manifest.',
)

const duplicateLinkTo = computed(() => {
  if (!duplicateHit.value) return ''
  return props.modKind === 'plugin'
    ? `/plugins/${duplicateHit.value.id}`
    : `/softmods/${duplicateHit.value.id}`
})

function resetUploadForm() {
  uploadFile.value = null
  uploadTitle.value = ''
  uploadDescription.value = ''
  uploadNotes.value = ''
  semver.reset()
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
    if (props.modKind === 'plugin') {
      const { data: hit, status: hitStatus } = await api.api.plugins['by-hash']({ hash }).get()
      if (hitStatus === 200 && hit && 'pluginId' in hit) {
        duplicateHit.value = { id: hit.pluginId, semver: hit.semver }
      }
    }
    else {
      const { data: hit, status: hitStatus } = await api.api.softmods['by-hash']({ hash }).get()
      if (hitStatus === 200 && hit && 'softmodId' in hit) {
        duplicateHit.value = { id: hit.softmodId, semver: hit.semver }
      }
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
  if (props.modKind === 'plugin' && !uploadTitle.value.trim()) return

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
    form.append('semver', semver.canonical.value)
    if (props.modKind === 'plugin') {
      form.append('title', uploadTitle.value.trim())
      if (uploadDescription.value.trim()) {
        form.append('description', uploadDescription.value.trim())
      }
    }
    if (uploadNotes.value.trim()) {
      form.append('notes', uploadNotes.value.trim())
    }

    const endpoint =
      props.modKind === 'plugin' ? `${apiUrl.value}/api/plugins` : `${apiUrl.value}/api/softmods`

    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })

    const payload = await res.json().catch(() => null) as Record<string, unknown> | null
    if (!res.ok) {
      if (res.status === 409) {
        const dup = parseUploadDuplicatePayload(payload)
        if (dup) duplicateHit.value = dup
      }
      uploadError.value = (payload?.error as string | undefined) || `Upload failed (${res.status})`
      return
    }

    showUpload.value = false
    await refresh()
    const createdId = (payload?.id as string | undefined)
    if (createdId) {
      await router.push(
        props.modKind === 'plugin' ? `/plugins/${createdId}` : `/softmods/${createdId}`,
      )
    }
  }
  catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  }
  finally {
    uploadBusy.value = false
  }
}

const canSubmitUpload = computed(() => {
  if (!uploadFile.value || uploadBusy.value || duplicateHit.value) return false
  if (props.modKind === 'plugin') return Boolean(uploadTitle.value.trim())
  return true
})
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-5xl space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <PageHeader
      :eyebrow="eyebrow ?? 'Library'"
      :icon="modKind === 'plugin' ? 'i-lucide-puzzle' : 'i-lucide-package'"
      :title="title"
      :description="description"
      :count="status === 'success' ? total : null"
    >
      <template #actions>
        <UModal
          v-if="user && gameId"
          v-model:open="showUpload"
          :title="uploadModalTitle"
          :description="uploadModalDescription"
          :ui="{ content: 'sm:max-w-lg' }"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
          >
            {{ uploadModalTitle }}
          </UButton>

          <template #body>
            <form
              :id="`${modKind}-upload-form`"
              class="grid gap-5"
              @submit.prevent="submitUpload"
            >
              <UFileUpload
                :model-value="uploadFile"
                :accept="uploadAccept"
                icon="i-lucide-file-archive"
                :label="modKind === 'plugin' ? 'Drop plugin ZIP here' : 'Drop .zipmod here'"
                description="or click to browse"
                layout="list"
                class="min-h-40"
                @update:model-value="onFileSelected"
              />

              <template v-if="modKind === 'plugin'">
                <UFormField
                  label="Title"
                  required
                >
                  <UInput
                    v-model="uploadTitle"
                    placeholder="Plugin title"
                    required
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Description"
                  hint="Optional"
                >
                  <UTextarea
                    v-model="uploadDescription"
                    placeholder="What does this plugin do?"
                    :rows="3"
                    autoresize
                    class="w-full"
                  />
                </UFormField>
              </template>

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
                label="Release notes"
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
                :to="duplicateLinkTo"
                :label="duplicateHit.semver ? `version ${duplicateHit.semver}` : 'existing upload'"
                lead="This file already exists as"
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
                :form="`${modKind}-upload-form`"
                color="primary"
                icon="i-lucide-check"
                :loading="uploadBusy"
                :disabled="!canSubmitUpload"
              >
                Publish
              </UButton>
            </div>
          </template>
        </UModal>
      </template>
    </PageHeader>

    <CatalogToolbar
      v-if="status === 'success' && (total > 0 || (modKind === 'plugin' ? Boolean(query.trim()) : tags.length > 0))"
      v-model:query="query"
      v-model:tags="tags"
      v-model:sort="sort"
      :search="modKind === 'softmod' ? 'tags' : 'text'"
      :placeholder="modKind === 'plugin' ? 'Search plugins by name…' : 'Filter by tags…'"
      @apply="onApplyTags"
    />

    <GallerySkeleton
      v-if="status === 'pending'"
      variant="row"
      :count="5"
    />

    <LoadError
      v-else-if="error"
      title="Could not load catalog"
      :message="error.message"
      @retry="refresh()"
    />

    <UEmpty
      v-else-if="total === 0 && (modKind === 'plugin' ? !query.trim() : appliedTags.length === 0)"
      :icon="modKind === 'plugin' ? 'i-lucide-puzzle' : 'i-lucide-package'"
      title="Nothing published yet"
      :description="user ? 'Be the first to share one.' : 'Sign in to share the first one.'"
      variant="soft"
      class="py-16"
    />

    <UEmpty
      v-else-if="items.length === 0"
      icon="i-lucide-search-x"
      title="Nothing matches"
      :description="modKind === 'plugin' ? `Nothing matches “${query}”.` : `Nothing matches ${appliedTags.join(' + ')}.`"
      variant="naked"
      :actions="[{ label: modKind === 'plugin' ? 'Clear search' : 'Clear tags', color: 'neutral', variant: 'outline', onClick: () => { if (modKind === 'plugin') query = ''; else clearTags() } }]"
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
      v-else-if="status === 'success' && items.length > 0"
      class="ed-stagger space-y-3"
    >
      <ModRow
        v-for="item in items"
        :key="item.id"
        :mod-kind="modKind"
        :item="item"
        :api-url="apiUrl"
        :show-install="Boolean(instanceId)"
        :installed="installedIds.has(item.id)"
        :install-loading="isTargetBusy(item.id)"
        :install-disabled="!isDesktop && !installedIds.has(item.id)"
        :install-label="installedIds.has(item.id) ? 'Uninstall' : (isDesktop ? 'Install' : 'Desktop only')"
        @install="toggleInstall(item)"
      />
    </div>

    <div
      v-if="status === 'success' && total > DEFAULT_PAGE_LIMIT"
      class="flex justify-center pt-2"
    >
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="DEFAULT_PAGE_LIMIT"
      />
    </div>
  </main>
</template>
