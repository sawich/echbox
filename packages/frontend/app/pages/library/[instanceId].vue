<script setup lang="ts">
import type { ContentKind, GameListItem } from '@echbox/shared'
import type { GameInstance } from '~/composables/useLocalInstalls'

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
const { isDesktop, listInstalledInstances } = useLocalInstalls()

const tab = ref<LibraryTab | null>(null)
const activeInstance = ref<GameInstance | null>(null)

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

async function refreshInstalled() {
  if (!isDesktop.value) {
    activeInstance.value = null
    return
  }
  const instances = await listInstalledInstances()
  activeInstance.value = instances.find(i => i.instanceId === instanceId.value) ?? null
}

const isInstalled = computed(() => activeInstance.value !== null)

onMounted(() => {
  void refreshInstalled()
})
watch(instanceId, () => {
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
  <div class="flex min-h-full flex-col">
    <header class="sticky top-0 z-10 border-b border-[color-mix(in_oklab,var(--ed-outline-variant)_70%,transparent)] bg-[color-mix(in_oklab,var(--ed-surface)_92%,transparent)] px-4 pt-4 backdrop-blur-md sm:px-6">
      <UAlert
        v-if="isDesktop && !activeInstance && status !== 'pending'"
        color="warning"
        variant="subtle"
        icon="i-lucide-folder-x"
        title="Instance not found"
        description="This install may have been removed. Pick another game in the sidebar."
        class="mb-3"
      />

      <LoadError
        v-if="error"
        title="Game unavailable"
        :message="error.message"
        @retry="refresh()"
      />
      <template v-else-if="status === 'success' && game">
        <div class="mb-3 flex min-w-0 items-center gap-3">
          <img
            :src="iconSrc(game)"
            :alt="`${game.title} icon`"
            class="size-12 shrink-0 rounded-md bg-elevated object-contain"
          >
          <div class="min-w-0">
            <h1 class="truncate text-xl font-semibold text-highlighted">
              {{ activeInstance?.label || game.title }}
            </h1>
            <p
              v-if="activeInstance?.label && activeInstance.label !== game.title"
              class="truncate text-sm text-muted"
            >
              {{ game.title }}
            </p>
            <p class="text-xs text-dimmed">
              <span v-if="game.description">{{ game.description }} · </span>
              {{ isInstalled ? 'Installed locally' : 'Not installed on this device' }}
            </p>
          </div>
        </div>
        <div
          v-if="visibleTabs.length > 0"
          class="flex flex-wrap gap-1 pb-3"
        >
          <UButton
            v-for="t in visibleTabs"
            :key="t.key"
            size="sm"
            :icon="t.icon"
            :color="tab === t.key ? 'primary' : 'neutral'"
            :variant="tab === t.key ? 'soft' : 'ghost'"
            @click="tab = t.key"
          >
            {{ t.label }}
          </UButton>
        </div>
      </template>
    </header>

    <div class="flex-1">
      <div
        v-if="status === 'success' && game && visibleTabs.length === 0"
        class="px-4 py-12 text-center sm:px-6"
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
        :game-id="catalogGameId"
        :instance-id="instanceId"
      />
      <SceneGalleryPage
        v-else-if="tab === 'scenes' && game && catalogGameId"
        title="Scenes"
        description="Studio scenes for this game."
        :game-id="catalogGameId"
        :instance-id="instanceId"
      />
      <ClothesGalleryPage
        v-else-if="tab === 'clothes' && game && catalogGameId"
        title="Clothes"
        description="Outfit cards for this game."
        :game-id="catalogGameId"
        :instance-id="instanceId"
      />
      <ModCatalogPage
        v-else-if="tab === 'plugins' && game && catalogGameId"
        mod-kind="plugin"
        title="Plugins"
        description="Plugins for this game."
        :game-id="catalogGameId"
        :instance-id="instanceId"
      />
      <ModCatalogPage
        v-else-if="tab === 'softmods' && game && catalogGameId"
        mod-kind="softmod"
        title="Softmods"
        description="Softmods for this game."
        :game-id="catalogGameId"
        :instance-id="instanceId"
      />
    </div>
  </div>
</template>
