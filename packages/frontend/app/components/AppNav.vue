<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <nav
    class="sticky top-0 z-20 border-b border-[color-mix(in_oklab,var(--m3-outline-variant)_70%,transparent)] bg-[color-mix(in_oklab,var(--m3-surface)_88%,transparent)] backdrop-blur-md"
  >
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
      <NuxtLink
        to="/"
        class="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--m3-on-surface)]"
      >
        echbox
      </NuxtLink>
      <div class="flex items-center gap-1">
        <UButton
          to="/"
          :variant="route.path === '/' || route.path.startsWith('/cards') ? 'soft' : 'ghost'"
          color="primary"
          size="sm"
        >
          Gallery
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
  </nav>
</template>
