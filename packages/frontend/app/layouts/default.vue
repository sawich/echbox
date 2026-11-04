<script setup lang="ts">
const route = useRoute()
const scroller = ref<HTMLElement | null>(null)

// The content column owns the scroll, so reset it on navigation like a window would.
watch(() => route.path, () => {
  scroller.value?.scrollTo({ top: 0 })
})
</script>

<template>
  <div class="flex h-dvh flex-row bg-[var(--ed-surface)]">
    <AppNav />
    <div
      id="content"
      ref="scroller"
      class="ed-atmosphere relative min-h-0 min-w-0 flex-1 overflow-y-auto"
    >
      <slot />
    </div>
    <TasksToast />
  </div>
</template>
