<script setup lang="ts">
import type { GameListItem } from '@echbox/shared'

type LibraryTab = 'characters' | 'scenes' | 'clothes' | 'plugins' | 'softmods'

const tabs = [
  { key: 'characters' as const, label: 'Characters', icon: 'i-lucide-user-round' },
  { key: 'scenes' as const, label: 'Scenes', icon: 'i-lucide-clapperboard' },
  { key: 'clothes' as const, label: 'Clothes', icon: 'i-lucide-shirt' },
  { key: 'plugins' as const, label: 'Plugins', icon: 'i-lucide-puzzle' },
  { key: 'softmods' as const, label: 'Softmods', icon: 'i-lucide-package' },
]

const TAB_KEYS = new Set(tabs.map(t => t.key))

function tabFromQuery(raw: unknown): LibraryTab {
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && TAB_KEYS.has(value as LibraryTab)
    ? (value as LibraryTab)
    : 'characters'
}

const route = useRoute()
const gameId = computed(() => String(route.params.gameId))
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { isDesktop, listInstalledGames } = useLocalInstalls()

const tab = ref<LibraryTab>(tabFromQuery(route.query.tab))
const isInstalled = ref(false)

const { data: game, error, status, refresh } = await useAsyncData(
  () => `library-game-${gameId.value}`,
  async () => {
    const { data: body, error: err } = await api.api.games({ id: gameId.value }).get()
    if (err) throw err
    if (!body || 'error' in body) throw new Error('Game not found')
    return body as GameListItem
  },
  { watch: [gameId] },
)

async function refreshInstalled() {
  if (!isDesktop.value) {
    isInstalled.value = false
    return
  }
  const ids = await listInstalledGames()
  isInstalled.value = ids.includes(gameId.value)
}

onMounted(() => {
  void refreshInstalled()
})
watch(gameId, () => {
  tab.value = tabFromQuery(route.query.tab)
  void refreshInstalled()
})
watch(() => route.query.tab, (value) => {
  tab.value = tabFromQuery(value)
})

function iconSrc(g: GameListItem) {
  return `${apiUrl.value}${g.iconUrls['128']}?v=${encodeURIComponent(g.updatedAt)}`
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="sticky top-0 z-10 border-b border-[color-mix(in_oklab,var(--ed-outline-variant)_70%,transparent)] bg-[color-mix(in_oklab,var(--ed-surface)_92%,transparent)] px-4 pt-4 backdrop-blur-md sm:px-6">
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
              {{ game.title }}
            </h1>
            <p class="text-xs text-dimmed">
              <span v-if="game.description">{{ game.description }} · </span>
              {{ isInstalled ? 'Installed locally' : 'Not installed on this device' }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-1 pb-3">
          <UButton
            v-for="t in tabs"
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
      <CardGalleryPage
        v-if="tab === 'characters' && game"
        type="character"
        title="Characters"
        description="Character cards for this game."
        :game-id="gameId"
      />
      <SceneGalleryPage
        v-else-if="tab === 'scenes' && game"
        title="Scenes"
        description="Studio scenes for this game."
        :game-id="gameId"
      />
      <ClothesGalleryPage
        v-else-if="tab === 'clothes' && game"
        title="Clothes"
        description="Outfit cards for this game."
        :game-id="gameId"
      />
      <ModCatalogPage
        v-else-if="tab === 'plugins' && game"
        mod-kind="plugin"
        title="Plugins"
        description="Plugins for this game."
        :game-id="gameId"
      />
      <ModCatalogPage
        v-else-if="tab === 'softmods' && game"
        mod-kind="softmod"
        title="Softmods"
        description="Softmods for this game."
        :game-id="gameId"
      />
    </div>
  </div>
</template>
