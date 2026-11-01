<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'portrait' | 'landscape' | 'row'
  count?: number
}>(), {
  variant: 'portrait',
  count: 10,
})
</script>

<template>
  <div
    v-if="variant === 'row'"
    class="space-y-3"
    aria-busy="true"
    aria-label="Loading"
  >
    <div
      v-for="n in count"
      :key="n"
      class="ed-card flex items-center gap-4 p-4"
    >
      <USkeleton class="size-12 shrink-0 rounded-[var(--radius-md)]" />
      <div class="flex-1 space-y-2">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-3 w-2/3" />
      </div>
      <USkeleton class="hidden h-9 w-28 rounded-full sm:block" />
    </div>
  </div>

  <div
    v-else
    class="grid gap-4"
    :class="variant === 'landscape'
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'"
    aria-busy="true"
    aria-label="Loading"
  >
    <USkeleton
      v-for="n in count"
      :key="n"
      class="rounded-[var(--radius-xl)]"
      :class="variant === 'landscape' ? 'aspect-[320/180]' : 'aspect-[252/352]'"
    />
  </div>
</template>
