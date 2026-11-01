<script setup lang="ts">
const { isDesktop } = useLocalInstalls()
</script>

<template>
  <div class="flex h-full min-h-[24rem] items-center justify-center px-6 py-16">
    <UEmpty
      icon="i-lucide-library"
      :title="isDesktop ? 'Select a game' : 'Library is desktop-only'"
      :description="isDesktop
        ? 'Pick a game from the list on the left.'
        : 'Open the Tauri app to manage local installs.'"
      variant="soft"
    />
  </div>
</template>
