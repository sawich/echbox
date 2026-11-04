<script setup lang="ts">
import type { ContentKind, GameListItem } from '@echbox/shared'
import { useLibraryInstances } from '~/composables/useLibraryInstances'

type LibraryTab = 'characters' | 'scenes' | 'clothes' | 'plugins' | 'softmods'

const tabs = [
  { key: 'characters' as const, kind: 'cards' as ContentKind, label: 'Characters', icon: 'i-lucide-user-round' },
  { key: 'scenes' as const, kind: 'scenes' as ContentKind, label: 'Scenes', icon: 'i-lucide-clapperboard' },
  { key: 'clothes' as const, kind: 'clothes' as ContentKind, label: 'Clothes', icon: 'i-lucide-shirt' },
  { key: 'plugins' as const, kind: 'plugins' as ContentKind, label: 'Plugins', icon: 'i-lucide-puzzle' },
  { key: 'softmods' as const, kind: 'softmods' as ContentKind, label: 'Softmods', icon: 'i-lucide-package' },
]

const route = useRoute()
const instanceId = computed(() => String(route.params.instanceId))
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { isDesktop, instances, loaded: instancesLoaded, refreshInstalled } = useLibraryInstances()

const tab = ref<LibraryTab | null>(null)
const activeInstance = computed(() => instances.value.find(i => i.instanceId === instanceId.value) ?? null)

const catalogGameId = computed(() => activeInstance.value?.gameId ?? null)

const { data: game, error, status, refresh } = await useAsyncData(
  () => `library-game-${catalogGameId.value ?? instanceId.value}`,
  async () => {
    const gameId = catalogGameId.value
    if (!gameId) return null
    const { data: body, error: err } = await api.api.games({ id: gameId }).get()
    if (err) throw err
    if (!body || 'error' in body) throw new Error('Game not found')
    return body as GameListItem
  },
  { watch: [catalogGameId] },
)

const visibleTabs = computed(() => {
  const kinds = new Set((game.value?.contentKinds ?? []).map(k => k.kind))
  return tabs.filter(t => kinds.has(t.kind))
})

function contentRelPathFor(kind: ContentKind): string | null {
  const row = game.value?.contentKinds?.find(k => k.kind === kind)
  const path = row?.relPath?.trim()
  return path || null
}

function resolveTab(raw: unknown): LibraryTab | null {
  const visible = visibleTabs.value
  if (visible.length === 0) return null
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value === 'string' && visible.some(t => t.key === value)) {
    return value as LibraryTab
  }
  return visible[0]!.key
}

function syncTabFromRoute() {
  tab.value = resolveTab(route.query.tab)
}

const isInstalled = computed(() => activeInstance.value !== null)

onMounted(() => {
  void refreshInstalled()
})
watch([() => route.query.tab, visibleTabs], () => {
  syncTabFromRoute()
}, { immediate: true })

function iconSrc(g: GameListItem) {
  return `${apiUrl.value}${g.iconUrls['128']}?v=${encodeURIComponent(g.updatedAt)}`
}
</script>

<template>
  <div class="ed-page-enter flex min-h-full flex-col">
    <UAlert
      v-if="isDesktop && instancesLoaded && !activeInstance && status !== 'pending'"
      color="warning"
      variant="subtle"
      icon="i-lucide-folder-x"
      title="Instance not found"
      description="This install may have been removed. Pick another game in the sidebar."
      class="mx-5 mt-4 sm:mx-8"
    />

    <LoadError
      v-if="error"
      class="m-5 sm:m-8"
      title="Game unavailable"
      :message="error.message"
      @retry="refresh()"
    />

    <template v-else-if="status === 'success' && game">
      <!-- Steam-style hero: the game's icon bleeds into a blurred banner -->
      <section class="relative isolate overflow-hidden border-b border-[var(--ed-outline-variant)]">
        <img
          :src="iconSrc(game)"
          alt=""
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 -z-20 size-full scale-[2.5] object-cover opacity-70 blur-3xl saturate-150"
        >
        <div class="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--ed-surface)_20%,transparent)_0%,color-mix(in_oklab,var(--ed-surface)_78%,transparent)_65%,var(--ed-surface)_100%)]" />

        <div class="flex items-end gap-4 px-5 pt-12 pb-5 sm:gap-5 sm:px-8 sm:pt-16">
          <img
            :src="iconSrc(game)"
            :alt="`${game.title} icon`"
            class="size-16 shrink-0 rounded-[var(--radius-md)] bg-[var(--ed-surface-container-highest)] object-contain shadow-[var(--ed-shadow-lift)] ring-1 ring-white/10 sm:size-20"
          >
          <div class="min-w-0 flex-1">
            <p class="ed-eyebrow text-primary">
              Library
            </p>
            <h1 class="truncate text-2xl font-bold tracking-tight text-highlighted sm:text-3xl">
              {{ activeInstance?.label || game.title }}
            </h1>
            <p class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span
                v-if="activeInstance?.label && activeInstance.label !== game.title"
                class="truncate font-medium text-toned"
              >{{ game.title }}</span>
              <span
                v-if="game.description"
                class="truncate"
              >{{ game.description }}</span>
            </p>
          </div>
          <div class="hidden shrink-0 items-center gap-2 sm:flex">
            <span class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[color-mix(in_oklab,var(--ed-surface-container-lowest)_70%,transparent)] px-2.5 py-1 text-xs font-medium text-toned ring-1 ring-[var(--ed-outline-variant)] backdrop-blur-sm">
              <span
                class="size-1.5 rounded-full"
                :class="isInstalled ? 'bg-[var(--ed-secondary)]' : 'bg-[var(--ed-outline)]'"
              />
              {{ isInstalled ? 'Installed locally' : 'Not installed on this device' }}
            </span>
          </div>
        </div>
      </section>

      <div
        v-if="visibleTabs.length > 0"
        class="ed-chrome sticky top-0 z-10 border-b border-[var(--ed-outline-variant)] bg-[color-mix(in_oklab,var(--ed-surface)_88%,transparent)] px-5 backdrop-blur-md sm:px-8"
      >
        <div
          class="-mb-px flex gap-6 overflow-x-auto [scrollbar-width:none]"
          role="tablist"
          aria-label="Content"
        >
          <button
            v-for="t in visibleTabs"
            :key="t.key"
            type="button"
            role="tab"
            class="ed-tab"
            :aria-selected="tab === t.key"
            @click="tab = t.key"
          >
            <UIcon
              :name="t.icon"
              class="size-4"
            />
            {{ t.label }}
          </button>
        </div>
      </div>
    </template>

    <div class="flex-1">
      <div
        v-if="status === 'success' && game && visibleTabs.length === 0"
        class="px-5 py-12 text-center sm:px-8"
      >
        <p class="text-sm text-muted">
          This game has no content types enabled.
        </p>
      </div>
      <CardGalleryPage
        v-else-if="tab === 'characters' && game && catalogGameId"
        type="character"
        title="Characters"
        description="Character cards for this game."
        :eyebrow="activeInstance?.label || game.title"
        :game-id="catalogGameId"
        :instance-id="instanceId"
        :content-rel-path="contentRelPathFor('cards')"
      />
      <SceneGalleryPage
        v-else-if="tab === 'scenes' && game && catalogGameId"
        title="Scenes"
        description="Studio scenes for this game."
        :eyebrow="activeInstance?.label || game.title"
        :game-id="catalogGameId"
        :instance-id="instanceId"
        :content-rel-path="contentRelPathFor('scenes')"
      />
      <ClothesGalleryPage
        v-else-if="tab === 'clothes' && game && catalogGameId"
        title="Clothes"
        description="Outfit cards for this game."
        :eyebrow="activeInstance?.label || game.title"
        :game-id="catalogGameId"
        :instance-id="instanceId"
        :content-rel-path="contentRelPathFor('clothes')"
      />
      <ModCatalogPage
        v-else-if="tab === 'plugins' && game && catalogGameId"
        mod-kind="plugin"
        title="Plugins"
        description="Plugins for this game."
        :eyebrow="activeInstance?.label || game.title"
        :game-id="catalogGameId"
        :instance-id="instanceId"
        :content-rel-path="contentRelPathFor('plugins')"
      />
      <ModCatalogPage
        v-else-if="tab === 'softmods' && game && catalogGameId"
        mod-kind="softmod"
        title="Softmods"
        description="Softmods for this game."
        :eyebrow="activeInstance?.label || game.title"
        :game-id="catalogGameId"
        :instance-id="instanceId"
        :content-rel-path="contentRelPathFor('softmods')"
      />
    </div>
  </div>
</template>
