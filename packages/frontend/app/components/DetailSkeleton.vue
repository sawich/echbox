<script setup lang="ts">
withDefaults(defineProps<{
  media?: 'portrait' | 'landscape' | 'none'
}>(), {
  media: 'portrait',
})
</script>

<template>
  <div
    class="grid gap-8"
    :class="{
      'lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-12': media === 'portrait',
      'lg:grid-cols-[minmax(0,480px)_1fr] lg:gap-12': media === 'landscape',
    }"
    aria-busy="true"
    aria-label="Loading"
  >
    <USkeleton
      v-if="media !== 'none'"
      class="w-full rounded-[var(--radius-xl)]"
      :class="media === 'landscape' ? 'aspect-[320/180]' : 'aspect-[252/352]'"
    />
    <div class="space-y-5">
      <div class="flex gap-2">
        <USkeleton class="h-6 w-20 rounded-full" />
        <USkeleton class="h-6 w-24 rounded-full" />
      </div>
      <USkeleton class="h-10 w-2/3" />
      <USkeleton class="h-4 w-1/3" />
      <USkeleton class="h-10 w-48 rounded-full" />
      <USkeleton class="h-48 w-full rounded-[var(--radius-xl)]" />
    </div>
  </div>
</template>
