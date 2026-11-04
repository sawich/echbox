<script setup lang="ts">
import { useLibraryInstances } from '~/composables/useLibraryInstances'
const { isDesktop, loaded, entries } = useLibraryInstances()

const copy = computed(() => {
  if (!isDesktop.value) {
    return {
      title: 'Library is desktop-only',
      description: 'Open the desktop app to manage local installs.',
      icon: 'i-lucide-monitor',
    }
  }
  if (loaded.value && entries.value.length === 0) {
    return {
      title: 'No games installed',
      description: 'Add a game from the Store and it will show up in the sidebar.',
      icon: 'i-lucide-gamepad-2',
    }
  }
  return {
    title: 'Select a game',
    description: 'Pick one from the sidebar on the left.',
    icon: 'i-lucide-library',
  }
})
</script>

<template>
  <div class="ed-page-enter flex h-full min-h-[24rem] items-center justify-center px-6 py-16">
    <UEmpty
      :icon="copy.icon"
      :title="copy.title"
      :description="copy.description"
      variant="soft"
      class="w-full max-w-md"
      :actions="isDesktop && loaded && entries.length === 0
        ? [{ label: 'Browse Store', icon: 'i-lucide-store', color: 'primary', to: '/store' }]
        : []"
    />
  </div>
</template>
