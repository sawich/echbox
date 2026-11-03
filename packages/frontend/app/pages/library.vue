<script setup lang="ts">
import type { GameListItem } from '@echbox/shared'

const route = useRoute()
const router = useRouter()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { isDesktop, listInstalledGames, uninstallGame } = useLocalInstalls()

const installedIds = ref<string[]>([])
const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)

const { data, error, refresh } = await useAsyncData('library-games-meta', async () => {
  const { data: body, error: err } = await api.api.games.get()
  if (err) throw err
  return (body?.games ?? []) as GameListItem[]
})

const gamesById = computed(() => {
  const map = new Map<string, GameListItem>()
  for (const g of data.value ?? []) map.set(g.id, g)
  return map
})

const libraryGames = computed(() =>
  installedIds.value.map(id => ({
    id,
    meta: gamesById.value.get(id) ?? null,
  })),
)

const selectedId = computed(() => {
  const param = route.params.gameId
  return typeof param === 'string' ? param : null
})

async function refreshInstalled() {
  if (!isDesktop.value) {
    installedIds.value = []
    return
  }
  installedIds.value = await listInstalledGames()
}

onMounted(() => {
  void refreshInstalled()
})

watch(libraryGames, (games) => {
  if (route.path !== '/library' && !route.path.startsWith('/library/')) return
  if (selectedId.value) return
  if (games.length > 0) {
    void router.replace(`/library/${games[0]!.id}`)
  }
}, { immediate: true })

async function selectGame(id: string) {
  if (selectedId.value === id) return
  await router.push(`/library/${id}`)
}

async function onUninstall(id: string) {
  if (!isDesktop.value) return
  busyId.value = id
  actionError.value = null
  try {
    await uninstallGame(id)
    await refreshInstalled()
    if (selectedId.value === id) {
      const next = libraryGames.value.find(g => g.id !== id)
      await router.replace(next ? `/library/${next.id}` : '/library')
    }
  }
  catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Uninstall failed'
  }
  finally {
    busyId.value = null
  }
}

provide('libraryRefreshInstalled', refreshInstalled)

function iconSrc(game: GameListItem) {
  return `${apiUrl.value}${game.iconUrls['64']}?v=${encodeURIComponent(game.updatedAt)}`
}
</script>

<template>
  <div class="flex min-h-[calc(100dvh-4rem)]">
    <aside
      class="flex w-64 shrink-0 flex-col border-r border-[color-mix(in_oklab,var(--ed-outline-variant)_70%,transparent)] bg-[color-mix(in_oklab,var(--ed-surface)_88%,transparent)] sm:w-72"
    >
      <div class="flex items-center justify-between gap-2 border-b border-[color-mix(in_oklab,var(--ed-outline-variant)_70%,transparent)] px-3 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon
            name="i-lucide-library"
            class="size-4 shrink-0 text-primary"
          />
          <span class="truncate text-sm font-semibold text-highlighted">Library</span>
          <span
            v-if="libraryGames.length"
            class="tabular-nums text-xs text-dimmed"
          >{{ libraryGames.length }}</span>
        </div>
        <UButton
          to="/store"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-store"
          aria-label="Store"
        />
      </div>

      <UAlert
        v-if="!isDesktop"
        color="neutral"
        variant="subtle"
        icon="i-lucide-monitor"
        title="Desktop only"
        description="Installs live under ~/.echbox."
        class="m-3"
      />

      <UAlert
        v-if="actionError"
        color="error"
        variant="subtle"
        :title="actionError"
        class="m-3"
      />

      <LoadError
        v-if="error"
        class="m-3"
        title="Catalog unavailable"
        :message="error.message"
        @retry="refresh()"
      />

      <div
        v-else-if="isDesktop && libraryGames.length === 0"
        class="m-3 space-y-3 text-sm text-muted"
      >
        <p>No installed games.</p>
        <UButton
          to="/store"
          size="sm"
          color="primary"
          block
        >
          Browse Store
        </UButton>
      </div>

      <nav
        v-else
        class="flex-1 overflow-y-auto p-2"
        aria-label="Installed games"
      >
        <ul class="space-y-0.5">
          <li
            v-for="entry in libraryGames"
            :key="entry.id"
          >
            <div
              class="group flex items-stretch gap-0.5 rounded-[var(--radius-md)]"
              :class="selectedId === entry.id
                ? 'bg-[color-mix(in_oklab,var(--ed-primary)_16%,transparent)]'
                : 'hover:bg-[color-mix(in_oklab,var(--ed-surface-variant)_55%,transparent)]'"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
                @click="selectGame(entry.id)"
              >
                <img
                  v-if="entry.meta"
                  :src="iconSrc(entry.meta)"
                  :alt="`${entry.meta.title} icon`"
                  class="size-8 shrink-0 rounded-md bg-elevated object-contain"
                  loading="lazy"
                >
                <UIcon
                  v-else
                  name="i-lucide-gamepad-2"
                  class="size-8 shrink-0 rounded-md bg-elevated p-1.5 text-muted"
                />
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate text-sm font-medium"
                    :class="selectedId === entry.id ? 'text-primary' : 'text-highlighted'"
                  >
                    {{ entry.meta?.title || 'Unknown game' }}
                  </span>
                  <span class="mt-0.5 block truncate font-mono text-[10px] text-dimmed">
                    {{ entry.meta?.slug || entry.id.slice(0, 8) }}
                  </span>
                </span>
              </button>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-trash-2"
                class="my-1 mr-1 opacity-0 group-hover:opacity-100"
                :loading="busyId === entry.id"
                aria-label="Uninstall"
                @click="onUninstall(entry.id)"
              />
            </div>
          </li>
        </ul>
      </nav>
    </aside>

    <section class="min-w-0 flex-1 overflow-y-auto">
      <NuxtPage />
    </section>
  </div>
</template>
