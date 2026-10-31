<script setup lang="ts">
const route = useRoute()
const { user, initialized, refresh, login, logout } = useAuth()

onMounted(() => {
  if (!initialized.value) {
    refresh()
  }
})
</script>

<template>
  <nav
    class="sticky top-0 z-20 border-b border-[color-mix(in_oklab,var(--m3-outline-variant)_70%,transparent)] bg-[color-mix(in_oklab,var(--m3-surface)_88%,transparent)] backdrop-blur-md"
  >
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
      <div class="flex items-center gap-6">
        <NuxtLink
          to="/"
          class="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--m3-on-surface)]"
        >
          echbox
        </NuxtLink>
        <div class="flex items-center gap-1">
          <UButton
            to="/"
            :variant="route.path === '/' ? 'soft' : 'ghost'"
            color="primary"
            size="sm"
          >
            Characters
          </UButton>
          <UButton
            to="/scenes"
            :variant="route.path.startsWith('/scenes') ? 'soft' : 'ghost'"
            color="primary"
            size="sm"
          >
            Scenes
          </UButton>
          <UButton
            to="/uikit"
            :variant="route.path.startsWith('/uikit') ? 'soft' : 'ghost'"
            color="primary"
            size="sm"
          >
            UI kit
          </UButton>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <template v-if="user">
          <div class="flex items-center gap-2">
            <img
              v-if="user.avatar"
              :src="user.avatar"
              :alt="user.username"
              class="size-7 rounded-full object-cover ring-1 ring-[var(--m3-outline-variant)]"
            >
            <span class="m3-label-md text-[var(--m3-on-surface)]">
              {{ user.username }}
            </span>
          </div>
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
          variant="soft"
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
