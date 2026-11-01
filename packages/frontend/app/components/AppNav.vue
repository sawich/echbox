<script setup lang="ts">
const route = useRoute()
const { user, initialized, refresh, login, logout } = useAuth()

onMounted(() => {
  if (!initialized.value) {
    refresh()
  }
})

const linkClass = (active: boolean) =>
  [
    'ed-label-md px-1 py-0.5 transition-colors',
    active
      ? 'text-[var(--ed-primary)]'
      : 'text-[var(--ed-on-surface-variant)] hover:text-[var(--ed-on-surface)]',
  ]
</script>

<template>
  <nav
    class="sticky top-0 z-20 border-b border-[var(--ed-outline-variant)] bg-[color-mix(in_oklab,var(--ed-surface)_92%,transparent)] backdrop-blur-md transition-[border-color,background-color] duration-300 ease-[var(--ed-ease-emphasized)]"
  >
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-6">
      <div class="flex items-baseline gap-8">
        <NuxtLink
          to="/"
          class="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--ed-on-surface)]"
        >
          echbox
        </NuxtLink>
        <div class="flex items-center gap-5">
          <NuxtLink
            to="/"
            :class="linkClass(route.path === '/')"
          >
            Characters
          </NuxtLink>
          <NuxtLink
            to="/scenes"
            :class="linkClass(route.path.startsWith('/scenes'))"
          >
            Scenes
          </NuxtLink>
          <NuxtLink
            to="/uikit"
            :class="linkClass(route.path.startsWith('/uikit'))"
          >
            UI kit
          </NuxtLink>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <template v-if="user">
          <NuxtLink
            :to="`/u/${user.id}`"
            class="flex items-center gap-2 px-1 py-1 transition-colors hover:text-[var(--ed-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-primary)]"
            :class="route.path === `/u/${user.id}` ? 'text-[var(--ed-primary)]' : 'text-[var(--ed-on-surface)]'"
          >
            <img
              v-if="user.avatar"
              :src="user.avatar"
              :alt="user.username"
              class="size-7 rounded-[var(--radius-sm)] object-cover ring-1 ring-[var(--ed-outline-variant)]"
            >
            <span class="ed-label-md">
              {{ user.username }}
            </span>
          </NuxtLink>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-log-out"
            @click="logout"
          >
            Logout
          </UButton>
        </template>
        <UButton
          v-else
          variant="solid"
          color="primary"
          size="sm"
          icon="i-lucide-log-in"
          @click="login"
        >
          Login with Discord
        </UButton>
      </div>
    </div>
  </nav>
</template>
