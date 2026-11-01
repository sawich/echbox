<script setup lang="ts">
import type { DropdownMenuItem } from '#ui/types'

const route = useRoute()
const { user, initialized, refresh, login, logout } = useAuth()

onMounted(() => {
  if (!initialized.value) {
    refresh()
  }
})

const links = [
  { label: 'Characters', to: '/', icon: 'i-lucide-user-round', match: (p: string) => p === '/' || p.startsWith('/cards') },
  { label: 'Scenes', to: '/scenes', icon: 'i-lucide-clapperboard', match: (p: string) => p.startsWith('/scenes') },
  { label: 'Plugins', to: '/plugins', icon: 'i-lucide-puzzle', match: (p: string) => p.startsWith('/plugins') },
  { label: 'Softmods', to: '/softmods', icon: 'i-lucide-package', match: (p: string) => p.startsWith('/softmods') },
]

const userMenu = computed<DropdownMenuItem[][]>(() => {
  if (!user.value) return []
  return [
    [{ label: user.value.username, type: 'label', avatar: user.value.avatar ? { src: user.value.avatar } : undefined }],
    [
      { label: 'Profile', icon: 'i-lucide-user', to: `/u/${user.value.id}` },
      { label: 'UI kit', icon: 'i-lucide-swatch-book', to: '/uikit' },
    ],
    [{ label: 'Log out', icon: 'i-lucide-log-out', color: 'error', onSelect: () => logout() }],
  ]
})
</script>

<template>
  <header class="ed-glass sticky top-0 z-30 border-b border-[color-mix(in_oklab,var(--ed-outline-variant)_70%,transparent)]">
    <div class="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
      <NuxtLink
        to="/"
        class="group flex shrink-0 items-center gap-2.5 rounded-full"
        aria-label="echbox home"
      >
        <span class="grid size-8 place-items-center rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--ed-primary)] to-[var(--ed-secondary)] text-white shadow-[0_4px_14px_-4px_var(--ed-primary)] transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105">
          <UIcon
            name="i-lucide-box"
            class="size-4.5"
          />
        </span>
        <span class="text-lg font-semibold tracking-tight text-highlighted">echbox</span>
      </NuxtLink>

      <nav
        class="hidden items-center gap-1 rounded-full border border-default bg-elevated/60 p-1 md:flex"
        aria-label="Primary"
      >
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
          :class="link.match(route.path)
            ? 'bg-[var(--ed-surface-container-highest)] text-highlighted shadow-sm'
            : 'text-muted hover:text-highlighted'"
          :aria-current="link.match(route.path) ? 'page' : undefined"
        >
          <UIcon
            :name="link.icon"
            class="size-4"
            :class="link.match(route.path) ? 'text-primary' : ''"
          />
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <UColorModeButton
          color="neutral"
          variant="ghost"
        />

        <UDropdownMenu
          v-if="user"
          :items="userMenu"
          :content="{ align: 'end' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            class="gap-2 p-1 pr-3"
            :aria-label="`Account menu for ${user.username}`"
          >
            <UAvatar
              :src="user.avatar ?? undefined"
              :alt="user.username"
              size="sm"
            />
            <span class="hidden max-w-32 truncate text-sm sm:inline">{{ user.username }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-dimmed"
            />
          </UButton>
        </UDropdownMenu>

        <UButton
          v-else-if="initialized"
          color="primary"
          icon="i-lucide-log-in"
          @click="login"
        >
          <span class="hidden sm:inline">Sign in with Discord</span>
          <span class="sm:hidden">Sign in</span>
        </UButton>
      </div>
    </div>

    <nav
      class="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] md:hidden"
      aria-label="Primary"
    >
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
        :class="link.match(route.path)
          ? 'bg-[var(--ed-surface-container-highest)] text-highlighted'
          : 'text-muted hover:text-highlighted'"
        :aria-current="link.match(route.path) ? 'page' : undefined"
      >
        <UIcon
          :name="link.icon"
          class="size-4"
        />
        {{ link.label }}
      </NuxtLink>
    </nav>
  </header>
</template>
