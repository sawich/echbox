<script setup lang="ts">
import type { DropdownMenuItem } from '#ui/types'
import { useLibraryInstances } from '~/composables/useLibraryInstances'

const route = useRoute()
const router = useRouter()
const { user, initialized, refresh, login, logout } = useAuth()
const { runningTasks } = useAppTasks()
const {
  isDesktop,
  entries,
  loaded,
  busyId,
  loadGames,
  refreshInstalled,
  uninstall,
  iconSrc,
  entryTitle,
  entrySubtitle,
} = useLibraryInstances()

/** Below `md` the sidebar stays vertical but collapses to an icon rail. */
const isRail = useMediaQuery('(max-width: 767px)')

onMounted(() => {
  if (!initialized.value) {
    refresh()
  }
  void loadGames()
  void refreshInstalled()
})

const links = [
  { label: 'Library', to: '/library', icon: 'i-lucide-library', match: (p: string) => p === '/' || p.startsWith('/library') },
  { label: 'Store', to: '/store', icon: 'i-lucide-store', match: (p: string) => p.startsWith('/store') },
  { label: 'Tasks', to: '/tasks', icon: 'i-lucide-list-todo', match: (p: string) => p.startsWith('/tasks') },
]

const runningCount = computed(() => runningTasks.value.length)

const gameQuery = ref('')
const filteredEntries = computed(() => {
  const q = gameQuery.value.trim().toLowerCase()
  if (!q) return entries.value
  return entries.value.filter(e =>
    entryTitle(e).toLowerCase().includes(q)
    || (e.meta?.title ?? '').toLowerCase().includes(q)
    || (e.meta?.slug ?? '').toLowerCase().includes(q),
  )
})

const selectedInstanceId = computed(() => {
  const param = route.params.instanceId
  return typeof param === 'string' ? param : null
})

async function openInstance(instanceId: string) {
  if (selectedInstanceId.value === instanceId) return
  await router.push(`/library/${instanceId}`)
}

async function onUninstall(instanceId: string) {
  const ok = await uninstall(instanceId)
  if (ok && selectedInstanceId.value === instanceId) {
    const next = entries.value[0]
    await router.replace(next ? `/library/${next.instance.instanceId}` : '/library')
  }
}

const userMenu = computed<DropdownMenuItem[][]>(() => {
  if (!user.value) return []
  return [
    [{ label: user.value.username, type: 'label', avatar: user.value.avatar ? { src: user.value.avatar } : undefined }],
    [
      { label: 'Profile', icon: 'i-lucide-user', to: `/u/${user.value.id}` },
      { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
      { label: 'UI kit', icon: 'i-lucide-swatch-book', to: '/uikit' },
    ],
    [{ label: 'Log out', icon: 'i-lucide-log-out', color: 'error', onSelect: () => logout() }],
  ]
})
</script>

<template>
  <aside
    class="ed-chrome flex h-full w-[var(--ed-rail-width)] shrink-0 flex-col border-r border-[var(--ed-sidebar-border)] bg-[var(--ed-sidebar)] md:w-[var(--ed-sidebar-width)]"
    aria-label="Sidebar"
  >
    <!-- Brand -->
    <div class="flex h-14 shrink-0 items-center justify-center px-2 md:justify-start md:px-4">
      <NuxtLink
        to="/library"
        class="group flex items-center gap-2.5 rounded-[var(--radius-sm)]"
        aria-label="echbox home"
        :title="isRail ? 'echbox' : undefined"
      >
        <span class="grid size-7 place-items-center rounded-[var(--radius-sm)] bg-[image:var(--ed-gradient-primary)] text-white shadow-[0_2px_10px_-3px_var(--ed-primary)] transition-transform duration-200 group-hover:scale-105">
          <UIcon
            name="i-lucide-box"
            class="size-4"
          />
        </span>
        <span class="hidden text-[15px] font-bold tracking-tight text-highlighted md:inline">echbox</span>
      </NuxtLink>
    </div>

    <!-- Primary navigation -->
    <nav
      class="shrink-0 px-2 md:px-3"
      aria-label="Primary"
    >
      <ul class="space-y-0.5">
        <li
          v-for="link in links"
          :key="link.to"
        >
          <NuxtLink
            :to="link.to"
            class="ed-nav-item ed-nav-item--caps justify-center md:justify-start"
            :aria-current="link.match(route.path) ? 'page' : undefined"
            :title="isRail ? link.label : undefined"
          >
            <span class="relative shrink-0">
              <UIcon
                :name="link.icon"
                class="ed-nav-icon size-4.5"
              />
              <span
                v-if="link.to === '/tasks' && runningCount > 0"
                class="absolute -top-1 -right-1.5 size-2 rounded-full bg-[var(--ed-primary)] ring-2 ring-[var(--ed-sidebar)] md:hidden"
              />
            </span>
            <span class="hidden truncate md:inline">{{ link.label }}</span>
            <span
              v-if="link.to === '/tasks' && runningCount > 0"
              class="ml-auto hidden min-w-5 items-center justify-center gap-1 rounded-full bg-[var(--ed-primary)] px-1.5 text-[10px] leading-4 font-semibold tracking-normal text-[var(--ed-on-primary)] tabular-nums md:inline-flex"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-2.5 animate-spin"
              />
              {{ runningCount }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <!-- Installed games (desktop app only) -->
    <div
      v-if="isDesktop"
      class="mt-3 flex min-h-0 flex-1 flex-col border-t border-[var(--ed-sidebar-border)]"
    >
      <div class="hidden items-center justify-between gap-2 px-4 pt-3 pb-1.5 md:flex">
        <span class="ed-eyebrow text-dimmed">
          Installed
          <span
            v-if="entries.length"
            class="text-muted tabular-nums"
          >({{ entries.length }})</span>
        </span>
        <UButton
          to="/store"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-plus"
          aria-label="Add from Store"
          title="Add from Store"
        />
      </div>

      <div
        v-if="entries.length > 0"
        class="hidden px-3 pb-2 md:block"
      >
        <UInput
          v-model="gameQuery"
          size="sm"
          icon="i-lucide-search"
          placeholder="Search games"
          class="w-full"
          :ui="{ base: 'bg-[var(--ed-surface-container-lowest)]' }"
        />
      </div>

      <div
        v-if="!loaded"
        class="space-y-1.5 px-3 py-2"
        aria-busy="true"
      >
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-8 w-full"
        />
      </div>

      <div
        v-else-if="entries.length === 0"
        class="hidden px-4 py-3 text-xs text-muted md:block"
      >
        No games installed yet.
        <NuxtLink
          to="/store"
          class="font-medium text-primary hover:underline"
        >Browse the Store</NuxtLink>.
      </div>

      <p
        v-else-if="filteredEntries.length === 0"
        class="hidden px-4 py-3 text-xs text-muted md:block"
      >
        Nothing matches “{{ gameQuery }}”.
      </p>

      <ul
        v-else
        class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 md:px-3"
        aria-label="Installed games"
      >
        <li
          v-for="entry in filteredEntries"
          :key="entry.instance.instanceId"
        >
          <div
            class="group relative flex items-center gap-1 rounded-[var(--radius-sm)] transition-colors before:absolute before:top-1/2 before:-left-2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[var(--ed-primary)] before:opacity-0 before:transition-opacity before:content-[''] md:pr-1"
            :class="selectedInstanceId === entry.instance.instanceId
              ? 'bg-[color-mix(in_oklab,var(--ed-primary)_16%,transparent)] before:opacity-100'
              : 'hover:bg-[color-mix(in_oklab,var(--ed-on-surface)_7%,transparent)]'"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[var(--radius-sm)] py-1.5 text-left md:justify-start md:pl-1.5"
              :title="isRail ? entryTitle(entry) : undefined"
              @click="openInstance(entry.instance.instanceId)"
            >
              <img
                v-if="entry.meta"
                :src="iconSrc(entry.meta)"
                :alt="`${entry.meta.title} icon`"
                class="size-7 shrink-0 rounded-[var(--radius-xs)] bg-[var(--ed-surface-container-highest)] object-contain ring-1 ring-[var(--ed-sidebar-border)]"
                loading="lazy"
              >
              <span
                v-else
                class="grid size-7 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--ed-surface-container-highest)] text-muted ring-1 ring-[var(--ed-sidebar-border)]"
              >
                <UIcon
                  name="i-lucide-gamepad-2"
                  class="size-4"
                />
              </span>
              <span class="hidden min-w-0 flex-1 md:block">
                <span
                  class="block truncate text-[13px] font-medium"
                  :class="selectedInstanceId === entry.instance.instanceId ? 'text-highlighted' : 'text-toned'"
                >
                  {{ entryTitle(entry) }}
                </span>
                <span class="block truncate font-mono text-[10px] text-dimmed">
                  {{ entrySubtitle(entry) }}
                </span>
              </span>
            </button>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-trash-2"
              class="hidden shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 md:inline-flex"
              :loading="busyId === entry.instance.instanceId"
              aria-label="Uninstall"
              @click="onUninstall(entry.instance.instanceId)"
            />
          </div>
        </li>
      </ul>
    </div>
    <div
      v-else
      class="min-h-0 flex-1"
    />

    <!-- Account & utilities -->
    <div class="shrink-0 space-y-2 border-t border-[var(--ed-sidebar-border)] p-2 md:p-3">
      <div class="flex flex-col items-center gap-0.5 md:flex-row">
        <UColorModeButton
          color="neutral"
          variant="ghost"
          size="sm"
        />
        <UButton
          to="/uikit"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-swatch-book"
          aria-label="UI kit"
          title="UI kit"
        />
      </div>

      <UDropdownMenu
        v-if="user"
        :items="userMenu"
        :content="{ align: 'start', side: isRail ? 'right' : 'top', sideOffset: 8 }"
        :ui="{ content: 'w-56' }"
      >
        <button
          type="button"
          class="ed-nav-item justify-center md:justify-start"
          :aria-label="`Account menu for ${user.username}`"
          :title="isRail ? user.username : undefined"
        >
          <span class="relative shrink-0">
            <UAvatar
              :src="user.avatar ?? undefined"
              :alt="user.username"
              size="xs"
            />
            <span class="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-[var(--ed-secondary)] ring-2 ring-[var(--ed-sidebar)]" />
          </span>
          <span class="hidden min-w-0 flex-1 flex-col md:flex">
            <span class="truncate text-highlighted">{{ user.username }}</span>
            <span class="truncate text-[11px] font-normal text-[var(--ed-secondary)]">Signed in</span>
          </span>
          <UIcon
            name="i-lucide-chevrons-up-down"
            class="ml-auto hidden size-4 shrink-0 text-dimmed md:inline"
          />
        </button>
      </UDropdownMenu>

      <template v-else-if="initialized">
        <UButton
          color="primary"
          icon="i-lucide-log-in"
          block
          class="hidden md:flex"
          @click="login"
        >
          Sign in with Discord
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-log-in"
          block
          class="md:hidden"
          aria-label="Sign in with Discord"
          title="Sign in with Discord"
          @click="login"
        />
      </template>
    </div>
  </aside>
</template>
