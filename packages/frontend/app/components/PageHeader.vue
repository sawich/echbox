<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  description?: string
  icon?: string
  count?: number | null
}>()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div class="min-w-0 space-y-3">
      <div
        v-if="eyebrow || icon"
        class="flex items-center gap-2 text-primary"
      >
        <UIcon
          v-if="icon"
          :name="icon"
          class="size-4"
        />
        <span
          v-if="eyebrow"
          class="ed-eyebrow"
        >{{ eyebrow }}</span>
      </div>
      <h1 class="ed-headline-md flex items-baseline gap-3 text-highlighted">
        {{ title }}
        <span
          v-if="typeof count === 'number'"
          class="font-mono text-base font-normal tracking-normal text-dimmed tabular-nums"
        >{{ count }}</span>
      </h1>
      <p
        v-if="description"
        class="max-w-2xl text-pretty text-muted"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="flex shrink-0 items-center gap-2"
    >
      <slot name="actions" />
    </div>
  </header>
</template>
